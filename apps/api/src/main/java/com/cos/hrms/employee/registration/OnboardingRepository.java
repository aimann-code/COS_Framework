package com.cos.hrms.employee.registration;

import static com.cos.hrms.employee.registration.OnboardingContracts.*;

import com.cos.hrms.shared.COSError;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class OnboardingRepository {
  public record Draft(
      UUID id,
      String scope,
      String actor,
      String encrypted,
      int version,
      int config,
      UUID employee,
      Integer expected,
      String status,
      String note,
      String updated) {}

  public record Employee(
      UUID id,
      String scope,
      String code,
      String name,
      String encrypted,
      int version,
      String workEmail,
      String workEmailStatus,
      String created) {}

  public record EmployeeRef(UUID id, String code) {}

  public record Document(
      UUID id,
      String scope,
      UUID draft,
      String kind,
      String encrypted,
      String media,
      int bytes,
      String scan,
      String created) {}

  private final JdbcClient jdbc;
  private final RowMapper<Draft> draftMapper =
      (r, n) ->
          new Draft(
              r.getObject("draft_id", UUID.class),
              r.getString("scope_id"),
              r.getString("actor_id"),
              r.getString("body_encrypted"),
              r.getInt("version"),
              r.getInt("configuration_version"),
              r.getObject("employee_id", UUID.class),
              r.getObject("expected_employee_version", Integer.class),
              r.getString("status"),
              r.getString("review_note"),
              r.getTimestamp("updated_at").toInstant().toString());
  private final RowMapper<Employee> employeeMapper =
      (r, n) ->
          new Employee(
              r.getObject("employee_id", UUID.class),
              r.getString("scope_id"),
              r.getString("employee_code"),
              r.getString("display_name"),
              r.getString("profile_encrypted"),
              r.getInt("profile_version"),
              r.getString("work_email"),
              r.getString("work_email_status"),
              r.getTimestamp("created_at").toInstant().toString());
  private final RowMapper<Document> documentMapper =
      (r, n) ->
          new Document(
              r.getObject("document_id", UUID.class),
              r.getString("scope_id"),
              r.getObject("draft_id", UUID.class),
              r.getString("kind"),
              r.getString("encrypted_content"),
              r.getString("media_type"),
              r.getInt("byte_count"),
              r.getString("scan_status"),
              r.getTimestamp("created_at").toInstant().toString());

  public OnboardingRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<Draft> findDraft(String scope, UUID id) {
    return jdbc.sql(
            "SELECT * FROM people.profile_draft WHERE scope_id=:scope AND draft_id=:id FOR UPDATE")
        .param("scope", scope)
        .param("id", id)
        .query(draftMapper)
        .optional();
  }

  public Draft draft(String scope, UUID id) {
    return findDraft(scope, id).orElseThrow(COSError::missing);
  }

  public List<DraftSummary> drafts(String scope, String actor, boolean reviews) {
    return jdbc.sql(
            "SELECT * FROM people.profile_draft WHERE scope_id=:scope AND ((:reviews AND"
                + " status='SUBMITTED') OR (NOT :reviews AND actor_id=:actor AND status='DRAFT'))"
                + " ORDER BY updated_at DESC LIMIT 100")
        .param("scope", scope)
        .param("actor", actor)
        .param("reviews", reviews)
        .query(
            (r, n) ->
                new DraftSummary(
                    r.getString("draft_id"),
                    r.getInt("version"),
                    r.getString("status"),
                    r.getString("actor_id"),
                    r.getTimestamp("updated_at").toInstant().toString(),
                    r.getString("employee_id")))
        .list();
  }

  public List<DraftSummary> ownRequests(String scope, String actor) {
    return jdbc.sql(
            "SELECT * FROM people.profile_draft WHERE scope_id=:scope AND actor_id=:actor AND"
                + " status IN ('SUBMITTED','APPROVED','REJECTED') ORDER BY updated_at DESC LIMIT"
                + " 100")
        .param("scope", scope)
        .param("actor", actor)
        .query(
            (r, n) ->
                new DraftSummary(
                    r.getString("draft_id"),
                    r.getInt("version"),
                    r.getString("status"),
                    r.getString("actor_id"),
                    r.getTimestamp("updated_at").toInstant().toString(),
                    r.getString("employee_id")))
        .list();
  }

  public void insertDraft(
      UUID id,
      String scope,
      String actor,
      String encrypted,
      int config,
      UUID employee,
      Integer expected) {
    jdbc.sql(
            "INSERT INTO"
                + " people.profile_draft(draft_id,scope_id,actor_id,body_encrypted,version,configuration_version,employee_id,expected_employee_version,status)"
                + " VALUES(:id,:scope,:actor,:body,1,:config,:employee,:expected,'DRAFT')")
        .param("id", id)
        .param("scope", scope)
        .param("actor", actor)
        .param("body", encrypted)
        .param("config", config)
        .param("employee", employee, java.sql.Types.OTHER)
        .param("expected", expected, java.sql.Types.INTEGER)
        .update();
  }

  public void saveDraft(Draft d, String encrypted, int config) {
    jdbc.sql(
            "UPDATE people.profile_draft SET"
                + " body_encrypted=:body,configuration_version=:config,version=version+1,updated_at=now()"
                + " WHERE scope_id=:scope AND draft_id=:id AND status='DRAFT'")
        .param("body", encrypted)
        .param("config", config)
        .param("scope", d.scope())
        .param("id", d.id())
        .update();
  }

  public void transition(Draft d, String status, UUID employee, String reviewer, String note) {
    jdbc.sql(
            "UPDATE people.profile_draft SET"
                + " status=:status,employee_id=coalesce(:employee,employee_id),reviewed_by=:reviewer,review_note=:note,reviewed_at=CASE"
                + " WHEN :reviewer IS NULL THEN NULL ELSE now()"
                + " END,version=version+1,updated_at=now() WHERE scope_id=:scope AND draft_id=:id")
        .param("status", status)
        .param("employee", employee, java.sql.Types.OTHER)
        .param("reviewer", reviewer, java.sql.Types.VARCHAR)
        .param("note", note, java.sql.Types.VARCHAR)
        .param("scope", d.scope())
        .param("id", d.id())
        .update();
  }

  public Employee employee(String scope, UUID id) {
    return jdbc.sql("SELECT * FROM people.employee WHERE scope_id=:scope AND employee_id=:id")
        .param("scope", scope)
        .param("id", id)
        .query(employeeMapper)
        .optional()
        .orElseThrow(COSError::missing);
  }

  public Optional<Employee> byCode(String scope, String code) {
    return jdbc.sql("SELECT * FROM people.employee WHERE scope_id=:scope AND employee_code=:code")
        .param("scope", scope)
        .param("code", code)
        .query(employeeMapper)
        .optional();
  }

  public List<EmployeeSummary> employees(String scope, String search, UUID after, int limit) {
    String escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    return jdbc.sql(
            "SELECT * FROM people.employee WHERE scope_id=:scope AND (display_name ILIKE :search OR"
                + " employee_code ILIKE :search) AND (:after IS NULL OR employee_id>CAST(:after AS"
                + " uuid)) ORDER BY employee_id LIMIT :limit")
        .param("scope", scope)
        .param("search", "%" + escaped + "%")
        .param("after", after == null ? null : after.toString(), java.sql.Types.VARCHAR)
        .param("limit", limit)
        .query(
            (r, n) ->
                new EmployeeSummary(
                    r.getString("employee_id"),
                    r.getString("employee_code"),
                    r.getString("display_name"),
                    r.getInt("profile_version")))
        .list();
  }

  public void insertEmployee(
      UUID id,
      String scope,
      String code,
      String name,
      String body,
      String aadhaar,
      String pan,
      String workEmail,
      String workEmailStatus) {
    jdbc.sql(
            "INSERT INTO"
                + " people.employee(employee_id,scope_id,employee_code,display_name,profile_encrypted,profile_version,aadhaar_hash,pan_hash,work_email,work_email_status)"
                + " VALUES(:id,:scope,:code,:name,:body,1,:aadhaar,:pan,:workEmail,:workStatus)")
        .param("id", id)
        .param("scope", scope)
        .param("code", code)
        .param("name", name)
        .param("body", body)
        .param("aadhaar", aadhaar, java.sql.Types.VARCHAR)
        .param("pan", pan, java.sql.Types.VARCHAR)
        .param("workEmail", workEmail)
        .param("workStatus", workEmailStatus)
        .update();
  }

  public void updateWorkEmail(Employee e, String workEmail, String workEmailStatus) {
    jdbc.sql(
            "UPDATE people.employee SET work_email=:email, work_email_status=:status, updated_at=now()"
                + " WHERE scope_id=:scope AND employee_id=:id")
        .param("email", workEmail)
        .param("status", workEmailStatus)
        .param("scope", e.scope())
        .param("id", e.id())
        .update();
  }

  public Optional<EmployeeRef> workEmailOwner(String scope, String email) {
    return jdbc.sql(
            "SELECT employee_id, employee_code FROM people.employee WHERE scope_id=:scope AND"
                + " lower(work_email)=lower(:email)")
        .param("scope", scope)
        .param("email", email)
        .query(
            (r, n) ->
                new EmployeeRef(
                    r.getObject("employee_id", UUID.class), r.getString("employee_code")))
        .optional();
  }

  public void enqueueWorkEmailProvision(Employee e) {
    jdbc.sql(
            "INSERT INTO people.outbox(event_id,scope_id,employee_id,event_type,profile_version)"
                + " VALUES(:id,:scope,:employee,:event,:version)"
                + " ON CONFLICT(scope_id,employee_id,event_type,profile_version) DO NOTHING")
        .param("id", UUID.randomUUID())
        .param("scope", e.scope())
        .param("employee", e.id())
        .param("event", "WORK_EMAIL_PROVISION")
        .param("version", e.version())
        .update();
  }

  public void updateEmployee(Employee e, String name, String body, String aadhaar, String pan) {
    int changed =
        jdbc.sql(
                "UPDATE people.employee SET"
                    + " display_name=:name,profile_encrypted=:body,profile_version=profile_version+1,aadhaar_hash=:aadhaar,pan_hash=:pan,updated_at=now()"
                    + " WHERE scope_id=:scope AND employee_id=:id AND profile_version=:version")
            .param("name", name)
            .param("body", body)
            .param("aadhaar", aadhaar, java.sql.Types.VARCHAR)
            .param("pan", pan, java.sql.Types.VARCHAR)
            .param("scope", e.scope())
            .param("id", e.id())
            .param("version", e.version())
            .update();
    if (changed != 1)
      throw COSError.conflict(
          "PROFILE_VERSION_CONFLICT", "The employee changed. Refresh and resubmit.");
  }

  public void history(Employee e, String actor, String reason) {
    jdbc.sql(
            "INSERT INTO"
                + " people.profile_history(history_id,scope_id,employee_id,profile_version,body_encrypted,actor_id,reason)"
                + " VALUES(:id,:scope,:employee,:version,:body,:actor,:reason)")
        .param("id", UUID.randomUUID())
        .param("scope", e.scope())
        .param("employee", e.id())
        .param("version", e.version())
        .param("body", e.encrypted())
        .param("actor", actor)
        .param("reason", reason)
        .update();
    jdbc.sql(
            "INSERT INTO people.outbox(event_id,scope_id,employee_id,event_type,profile_version)"
                + " VALUES(:id,:scope,:employee,:event,:version)")
        .param("id", UUID.randomUUID())
        .param("scope", e.scope())
        .param("employee", e.id())
        .param("event", reason)
        .param("version", e.version())
        .update();
  }

  public void join(Employee e, LocalDate joining, boolean rejoin) {
    if (rejoin) {
      var last =
          jdbc.sql(
                  "SELECT max(joining_date) FROM people.employment_period WHERE scope_id=:scope AND"
                      + " employee_id=:id")
              .param("scope", e.scope())
              .param("id", e.id())
              .query(LocalDate.class)
              .optional();
      if (last.isPresent() && !joining.isAfter(last.get()))
        throw COSError.conflict(
            "JOINING_DATE_CONFLICT", "Rejoining must follow the previous joining date.");
      jdbc.sql(
              "UPDATE people.employment_period SET ended_on=:end WHERE scope_id=:scope AND"
                  + " employee_id=:id AND ended_on IS NULL")
          .param("end", joining.minusDays(1))
          .param("scope", e.scope())
          .param("id", e.id())
          .update();
    }
    jdbc.sql(
            "INSERT INTO"
                + " people.employment_period(period_id,scope_id,employee_id,joining_date,joining_type)"
                + " VALUES(:period,:scope,:id,:date,:type)")
        .param("period", UUID.randomUUID())
        .param("scope", e.scope())
        .param("id", e.id())
        .param("date", joining)
        .param("type", rejoin ? "Rejoiner" : "New joiner")
        .update();
  }

  public Optional<UUID> membership(String scope, String actor) {
    return jdbc.sql(
            "SELECT employee_id FROM people.employee_membership WHERE scope_id=:scope AND"
                + " actor_id=:actor")
        .param("scope", scope)
        .param("actor", actor)
        .query(UUID.class)
        .optional();
  }

  public long documentCount(String scope, String actor) {
    return jdbc.sql(
            "SELECT count(*) FROM people.document WHERE scope_id=:scope AND uploaded_by=:actor AND"
                + " created_at>now()-interval '1 day'")
        .param("scope", scope)
        .param("actor", actor)
        .query(Long.class)
        .single();
  }

  public void link(String scope, String actor, UUID employee, String hr) {
    jdbc.sql(
            "INSERT INTO people.employee_membership(scope_id,actor_id,employee_id,linked_by)"
                + " VALUES(:scope,:actor,:employee,:hr)")
        .param("scope", scope)
        .param("actor", actor)
        .param("employee", employee)
        .param("hr", hr)
        .update();
  }

  public List<Document> documents(String scope, UUID draft) {
    return jdbc.sql(
            "SELECT * FROM people.document WHERE scope_id=:scope AND draft_id=:draft AND deleted_at"
                + " IS NULL ORDER BY kind")
        .param("scope", scope)
        .param("draft", draft)
        .query(documentMapper)
        .list();
  }

  public List<Document> employeeDocuments(String scope, UUID employee) {
    return jdbc.sql(
            "SELECT DISTINCT ON (x.kind) x.* FROM people.document x JOIN people.profile_draft d ON"
                + " d.scope_id=x.scope_id AND d.draft_id=x.draft_id WHERE x.scope_id=:scope AND"
                + " d.employee_id=:employee AND d.status IN ('REGISTERED','APPROVED') AND"
                + " x.deleted_at IS NULL ORDER BY x.kind,x.created_at DESC,x.document_id")
        .param("scope", scope)
        .param("employee", employee)
        .query(documentMapper)
        .list();
  }

  public Document document(String scope, UUID id) {
    return jdbc.sql(
            "SELECT * FROM people.document WHERE scope_id=:scope AND document_id=:id AND deleted_at"
                + " IS NULL")
        .param("scope", scope)
        .param("id", id)
        .query(documentMapper)
        .optional()
        .orElseThrow(COSError::missing);
  }

  public void removeDocument(String scope, UUID id) {
    jdbc.sql(
            "UPDATE people.document SET deleted_at=now() WHERE scope_id=:scope AND document_id=:id"
                + " AND deleted_at IS NULL")
        .param("scope", scope)
        .param("id", id)
        .update();
  }

  public void addDocument(
      UUID id,
      String scope,
      UUID draft,
      String kind,
      String encrypted,
      String media,
      int size,
      String digest,
      String scan,
      String actor) {
    jdbc.sql(
            "INSERT INTO"
                + " people.document(document_id,scope_id,draft_id,kind,encrypted_content,media_type,byte_count,digest,scan_status,uploaded_by)"
                + " VALUES(:id,:scope,:draft,:kind,:body,:media,:size,:digest,:scan,:actor)")
        .param("id", id)
        .param("scope", scope)
        .param("draft", draft)
        .param("kind", kind)
        .param("body", encrypted)
        .param("media", media)
        .param("size", size)
        .param("digest", digest)
        .param("scan", scan)
        .param("actor", actor)
        .update();
  }
}
