package com.cos.hrms.leave;

import static com.cos.hrms.leave.LeaveContracts.*;

import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.COSAuditService;
import com.cos.hrms.shared.COSError;
import com.cos.hrms.shared.COSJson;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeaveService {
  public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
  private final LeaveRepository repository;
  private final COSAuditService audit;
  private final COSJson json;

  public LeaveService(LeaveRepository repository, COSAuditService audit, COSJson json) {
    this.repository = repository;
    this.audit = audit;
    this.json = json;
  }

  public static LocalDate today() {
    return LocalDate.now(ZONE);
  }

  public static BigDecimal dayCount(LocalDate start, LocalDate end, String mode) {
    if (end.isBefore(start))
      throw new COSError(422, "LEAVE_DATES_INVALID", "The leave end date is before the start date.");
    long count = 0;
    for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
      if ("WEEKDAYS".equals(mode)
          && (day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY))
        continue;
      count++;
    }
    if (count == 0)
      throw new COSError(
          422, "LEAVE_DAYS_EMPTY", "The selected dates contain no countable leave days.");
    if (count > 366)
      throw new COSError(422, "LEAVE_DAYS_INVALID", "A leave request cannot exceed 366 days.");
    return BigDecimal.valueOf(count).setScale(1);
  }

  @Transactional
  public void ensure(String scope) {
    repository.ensurePolicy(scope, "CL", "Casual leave", true, new BigDecimal("8.0"), 0, 3);
    repository.ensurePolicy(scope, "SL", "Sick leave", true, new BigDecimal("8.0"), 0, 5);
    repository.ensurePolicy(scope, "PL", "Privilege leave", true, new BigDecimal("18.0"), 7, 15);
    repository.ensurePolicy(scope, "LWP", "Leave without pay", false, new BigDecimal("30.0"), 0, 30);
  }

  @Transactional
  public Catalog catalog(COSActor actor, UUID employee) {
    requireReader(actor);
    ensure(actor.scope());
    UUID subject = subject(actor, employee);
    var policies = repository.policies(actor.scope()).stream().map(this::view).toList();
    List<BalanceView> balances =
        subject == null
            ? List.of()
            : policies.stream()
                .map(
                    policy ->
                        balance(
                            actor.scope(),
                            subject,
                            repository.policies(actor.scope()).stream()
                                .filter(row -> row.code().equals(policy.code()))
                                .findFirst()
                                .orElseThrow(),
                            today().getYear()))
                .toList();
    return new Catalog(
        "LEAVE",
        policies,
        balances,
        List.of("SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"),
        List.of("CALENDAR", "WEEKDAYS"),
        actions(actor));
  }

  @Transactional(readOnly = true)
  public List<RequestView> requests(COSActor actor) {
    requireReader(actor);
    UUID employee = hr(actor) || actor.admin() ? null : own(actor);
    return repository.requests(actor.scope(), employee).stream().map(this::view).toList();
  }

  @Transactional
  public PolicyView savePolicy(COSActor actor, String code, PolicyCommand command) {
    if (!hr(actor)) actor.require("ADMIN");
    ensure(actor.scope());
    var current =
        repository
            .lockPolicy(actor.scope(), code)
            .orElseThrow(COSError::missing);
    if (current.version() != command.version())
      throw COSError.conflict("POLICY_VERSION_CONFLICT", "This leave policy changed. Reload it.");
    var metadata = new LinkedHashMap<>(current.metadata());
    metadata.put("count_mode", command.count_mode());
    var next =
        new LeaveRepository.Policy(
            current.id(),
            current.code(),
            command.name().strip(),
            command.paid(),
            command.annual_quota().setScale(1, java.math.RoundingMode.HALF_UP),
            command.notice_days(),
            command.max_days(),
            command.active(),
            current.version(),
            Map.copyOf(metadata));
    repository.updatePolicy(actor.scope(), next, json.write(metadata));
    audit.record(actor.scope(), actor.id(), null, "UPDATE_LEAVE_POLICY", code, "UPDATED");
    return view(repository.lockPolicy(actor.scope(), code).orElseThrow());
  }

  @Transactional(readOnly = true)
  public EmployeeMatch findByCode(COSActor actor, String code) {
    actor.require("REGISTRAR");
    String normalized = code == null ? "" : code.strip();
    if (normalized.isBlank() || normalized.length() > 64)
      throw new COSError(400, "EMPLOYEE_CODE_INVALID", "Enter an employee ID.");
    var found =
        repository
            .findByCode(actor.scope(), normalized)
            .orElseThrow(
                () ->
                    new COSError(
                        404, "EMPLOYEE_NOT_FOUND", "No employee has this ID."));
    return new EmployeeMatch(found.id().toString(), found.code(), found.name());
  }

  @Transactional
  public RequestView submit(COSActor actor, Submit command) {
    ensure(actor.scope());
    boolean hr = hr(actor);
    if (!hr) actor.require("EMPLOYEE");
    if (command.record() && !hr) throw COSError.forbidden();
    UUID employeeId = hr ? command.employee_id() : own(actor);
    if (employeeId == null)
      throw new COSError(422, "EMPLOYEE_REQUIRED", "Choose the employee this leave applies to.");
    var employee = repository.lockEmployee(actor.scope(), employeeId);
    var policy =
        repository
            .lockPolicy(actor.scope(), command.policy_code().strip().toUpperCase(Locale.ROOT))
            .orElseThrow(COSError::missing);
    if (!policy.active())
      throw new COSError(422, "POLICY_INACTIVE", "This leave policy is not open for new requests.");
    String mode = policy.metadata().getOrDefault("count_mode", "CALENDAR");
    BigDecimal days = dayCount(command.start_on(), command.end_on(), mode);
    if (days.compareTo(BigDecimal.valueOf(policy.maxDays()).setScale(1)) > 0)
      throw new COSError(
          422, "LEAVE_MAX_DAYS", "The request is longer than this policy allows.", Map.of("end_on", "Reduce the date range."));
    if (!command.record()) {
      if (command.start_on().isBefore(today()))
        throw new COSError(422, "LEAVE_IN_PAST", "Leave requests cannot start in the past.");
      if (command.start_on().isBefore(today().plusDays(policy.notice())))
        throw new COSError(
            422,
            "LEAVE_NOTICE",
            "This policy needs more notice before the start date.",
            Map.of("start_on", "Choose a later start date."));
    }
    if (repository.overlaps(actor.scope(), employee.id(), command.start_on(), command.end_on(), null))
      throw COSError.conflict("LEAVE_OVERLAP", "These dates overlap leave that is already submitted or approved.");
    BigDecimal reserved = repository.reserved(actor.scope(), employee.id(), policy.id(), command.start_on().getYear());
    if (reserved.add(days).compareTo(policy.quota()) > 0)
      throw new COSError(422, "LEAVE_BALANCE", "The remaining balance does not cover this request.");
    UUID id = UUID.randomUUID();
    String status = command.record() ? "APPROVED" : "SUBMITTED";
    repository.insert(
        id,
        actor.scope(),
        employee.id(),
        policy.id(),
        command.start_on(),
        command.end_on(),
        days,
        command.reason().strip(),
        status,
        actor.id());
    audit.record(
        actor.scope(), actor.id(), null, command.record() ? "RECORD_LEAVE" : "SUBMIT_LEAVE", id.toString(), status);
    return view(repository.lockRequest(actor.scope(), id).orElseThrow());
  }

  @Transactional
  public RequestView decide(COSActor actor, UUID id, Decision decision) {
    var row = repository.lockRequest(actor.scope(), id).orElseThrow(COSError::missing);
    if (row.version() != decision.version())
      throw COSError.conflict(
          "LEAVE_VERSION_CONFLICT", "This leave request changed. Reload it before deciding.");
    boolean owner = row.actor().equals(actor.id());
    if (decision.decision().equals("CANCEL")) {
      if (!hr(actor) && !owner) throw COSError.forbidden();
    } else {
      actor.require("REGISTRAR");
      if (owner) throw new COSError(403, "SELF_REVIEW", "Another HR account must decide this request.");
      if (decision.decision().equals("REJECT")
          && (decision.remarks() == null || decision.remarks().isBlank()))
        throw new COSError(
            422, "REMARKS_REQUIRED", "Rejection requires an explanation.", Map.of("remarks", "Enter a reason."));
    }
    String status =
        switch (decision.decision()) {
          case "APPROVE" -> "APPROVED";
          case "REJECT" -> "REJECTED";
          default -> "CANCELLED";
        };
    repository.transition(
        actor.scope(),
        id,
        decision.version(),
        status,
        actor.id(),
        decision.remarks() == null ? null : decision.remarks().strip());
    audit.record(actor.scope(), actor.id(), null, "DECIDE_LEAVE", id.toString(), status);
    return view(repository.lockRequest(actor.scope(), id).orElseThrow());
  }

  private BalanceView balance(String scope, UUID employee, LeaveRepository.Policy policy, int year) {
    BigDecimal reserved = repository.reserved(scope, employee, policy.id(), year);
    return new BalanceView(
        policy.code(), policy.name(), policy.quota(), reserved, policy.quota().subtract(reserved));
  }

  private UUID subject(COSActor actor, UUID requested) {
    if (actor.roles().contains("EMPLOYEE") && !hr(actor)) return own(actor);
    return requested;
  }

  private UUID own(COSActor actor) {
    actor.require("EMPLOYEE");
    return repository
        .membership(actor.scope(), actor.id())
        .orElseThrow(
            () ->
                new COSError(
                    403, "EMPLOYEE_NOT_LINKED", "HR must link your account to an employee record."));
  }

  private void requireReader(COSActor actor) {
    if (!hr(actor) && !actor.admin()) actor.require("EMPLOYEE");
  }

  private boolean hr(COSActor actor) {
    return actor.roles().contains("REGISTRAR");
  }

  private List<String> actions(COSActor actor) {
    var actions = new ArrayList<String>();
    if (actor.roles().contains("EMPLOYEE")) actions.add("REQUEST");
    if (hr(actor)) actions.addAll(List.of("REQUEST", "RECORD", "DECIDE", "CONFIGURE"));
    if (actor.admin()) actions.add("CONFIGURE");
    return actions.stream().distinct().toList();
  }

  private PolicyView view(LeaveRepository.Policy policy) {
    return new PolicyView(
        policy.id().toString(),
        policy.code(),
        policy.name(),
        policy.paid(),
        policy.quota(),
        policy.notice(),
        policy.maxDays(),
        policy.active(),
        policy.version(),
        policy.metadata());
  }

  private RequestView view(LeaveRepository.RequestRow row) {
    return new RequestView(
        row.id().toString(),
        row.employee().toString(),
        row.employeeCode(),
        row.employeeName(),
        row.policyCode(),
        row.policyName(),
        row.start().toString(),
        row.end().toString(),
        row.days(),
        row.reason(),
        row.status(),
        row.version(),
        row.note(),
        row.actor(),
        row.created());
  }
}
