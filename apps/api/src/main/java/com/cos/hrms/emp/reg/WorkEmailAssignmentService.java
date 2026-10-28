package com.cos.hrms.emp.reg;

import com.cos.hrms.emp.OnboardingRepository;
import com.cos.shared.COSError;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class WorkEmailAssignmentService {
  private static final Pattern LOCAL =
      Pattern.compile("^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$");
  private static final int MAX_CANDIDATES = 64;

  private final OnboardingRepository repository;
  private final WorkEmailProperties mail;

  public WorkEmailAssignmentService(OnboardingRepository repository, WorkEmailProperties mail) {
    this.repository = repository;
    this.mail = mail;
  }

  public record ParsedName(String first, String middleInitial, String last) {}

  public record Assignment(
      String email,
      String status,
      String source,
      String collisionEmployeeCode,
      String note) {}

  public ParsedName parseName(String displayName) {
    var parts =
        Arrays.stream(Optional.ofNullable(displayName).orElse("").strip().split("\\s+"))
            .filter(s -> !s.isBlank())
            .toList();
    if (parts.isEmpty()) throw workEmailError("Enter the employee name before assigning work email.");
    String first = normalizeToken(parts.getFirst());
    String last = parts.size() == 1 ? first : normalizeToken(parts.getLast());
    String middle = "";
    if (parts.size() > 2) {
      String token = normalizeToken(parts.get(1));
      if (token.length() == 1) middle = token;
    }
    if (first.isBlank() || last.isBlank())
      throw workEmailError("The employee name must include recognizable first and last parts.");
    return new ParsedName(first, middle, last);
  }

  public Assignment assign(
      String scope,
      String displayName,
      String employeeCode,
      String mode,
      String existingEmail,
      OnboardingRepository.Employee rejoinEmployee) {
    String domain = mail.getDomain().strip().toLowerCase(Locale.ROOT);
    if (domain.isBlank()) throw workEmailError("Company mail domain is not configured.");
    if (rejoinEmployee != null
        && rejoinEmployee.workEmail() != null
        && !rejoinEmployee.workEmail().isBlank()) {
      return new Assignment(
          rejoinEmployee.workEmail(),
          "REUSED",
          "REJOIN",
          null,
          "Rejoin keeps the existing work email for this employee record.");
    }
    String normalizedMode =
        Optional.ofNullable(mode).orElse("generate").strip().toLowerCase(Locale.ROOT);
    if (normalizedMode.equals("existing")) {
      String email = normalizeExisting(existingEmail, domain);
      var owner = repository.workEmailOwner(scope, email);
      if (owner.isPresent()
          && (rejoinEmployee == null || !owner.get().id().equals(rejoinEmployee.id())))
        throw new COSError(
            422,
            "WORK_EMAIL_IN_USE",
            "That work email belongs to employee "
                + owner.get().code()
                + ". Choose another address or let the system generate one.");
      return new Assignment(
          email,
          "IMPORTED",
          "EXISTING",
          owner.map(OnboardingRepository.EmployeeRef::code).orElse(null),
          "HR supplied an existing company mailbox.");
    }
    if (!normalizedMode.equals("generate"))
      throw workEmailError("Choose whether the system generates work email or imports an existing mailbox.");
    var parsed = parseName(displayName);
    var candidates = candidates(parsed, employeeCode);
    for (String local : candidates) {
      if (!LOCAL.matcher(local).matches()) continue;
      String email = local + "@" + domain;
      var owner = repository.workEmailOwner(scope, email);
      if (owner.isEmpty())
        return new Assignment(
            email,
            "RESERVED",
            "GENERATED",
            null,
            local.equals(candidates.getFirst())
                ? "Assigned the default first.last work email."
                : "Assigned "
                    + email
                    + " because the preferred local part was already in use.");
      if (candidates.indexOf(local) == 0)
        continue;
    }
    throw workEmailError("Unable to assign a unique work email. Contact IT to extend the naming policy.");
  }

  public Assignment preview(
      String scope, String displayName, String employeeCode, String mode, String existingEmail) {
    return assign(scope, displayName, employeeCode, mode, existingEmail, null);
  }

  private List<String> candidates(ParsedName name, String employeeCode) {
    var list = new ArrayList<String>();
    list.add(name.first + "." + name.last);
    if (!name.middleInitial.isBlank())
      list.add(name.first + "." + name.middleInitial + "." + name.last);
    list.add(name.first + name.last);
    for (int i = 2; i <= 20; i++) list.add(name.first + "." + name.last + i);
    String code =
        Optional.ofNullable(employeeCode)
            .orElse("")
            .strip()
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]", "");
    if (code.length() > 8) code = code.substring(code.length() - 8);
    if (!code.isBlank()) list.add(name.first + "." + name.last + "." + code);
    return list.stream().distinct().limit(MAX_CANDIDATES).toList();
  }

  private String normalizeExisting(String raw, String domain) {
    if (raw == null || raw.isBlank())
      throw workEmailError("Enter the employee's existing company email address.");
    String email = raw.strip().toLowerCase(Locale.ROOT);
    if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
      throw workEmailError("Enter a valid work email address.");
    if (!email.endsWith("@" + domain))
      throw new COSError(
          422,
          "WORK_EMAIL_DOMAIN",
          "Work email must use the company domain @" + domain + ".");
    String local = email.substring(0, email.indexOf('@'));
    if (!LOCAL.matcher(local).matches())
      throw workEmailError("The work email local part uses unsupported characters.");
    return email;
  }

  private static String normalizeToken(String token) {
    if (token == null || token.isBlank()) return "";
    String ascii =
        Normalizer.normalize(token, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]", "");
    return ascii;
  }

  private static COSError workEmailError(String detail) {
    return new COSError(422, "WORK_EMAIL_INVALID", detail);
  }
}
