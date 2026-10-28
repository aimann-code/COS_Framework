package com.cos.hrms.leave;

import static com.cos.hrms.leave.LeaveContracts.*;

import com.cos.hrms.shared.COSError;
import com.cos.hrms.shared.COSJson;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;

@Repository
public class LeaveRepository {
  public record Policy(
      UUID id,
      String code,
      String name,
      boolean paid,
      BigDecimal quota,
      int notice,
      int maxDays,
      boolean active,
      int version,
      Map<String, String> metadata) {}

  public record EmployeeRef(UUID id, String code, String name) {}

  public record RequestRow(
      UUID id,
      UUID employee,
      String employeeCode,
      String employeeName,
      UUID policy,
      String policyCode,
      String policyName,
      LocalDate start,
      LocalDate end,
      BigDecimal days,
      String reason,
      String status,
      int version,
      String note,
      String actor,
      String created) {}

  private final JdbcClient jdbc;
  private final COSJson json;

  public LeaveRepository(JdbcClient jdbc, COSJson json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public void ensurePolicy(
      String scope, String code, String name, boolean paid, BigDecimal quota, int notice, int max) {
    jdbc.sql(
            "INSERT INTO people.leave_policy(policy_id,scope_id,code,name,paid,annual_quota,notice_days,max_days,active,metadata,version)"
                + " SELECT :id,:scope,:code,:name,:paid,:quota,:notice,:max,true,CAST(:metadata AS jsonb),1"
                + " WHERE NOT EXISTS (SELECT 1 FROM people.leave_policy WHERE scope_id=:scope AND code=:code)")
        .param("id", UUID.randomUUID())
        .param("scope", scope)
        .param("code", code)
        .param("name", name)
        .param("paid", paid)
        .param("quota", quota)
        .param("notice", notice)
        .param("max", max)
        .param("metadata", "{\"count_mode\":\"CALENDAR\"}")
        .update();
  }

  public List<Policy> policies(String scope) {
    return jdbc.sql(
            "SELECT * FROM people.leave_policy WHERE scope_id=:scope ORDER BY code")
        .param("scope", scope)
        .query((r, n) -> policy(r))
        .list();
  }

  public Optional<Policy> lockPolicy(String scope, String code) {
    return jdbc.sql(
            "SELECT * FROM people.leave_policy WHERE scope_id=:scope AND code=:code FOR UPDATE")
        .param("scope", scope)
        .param("code", code)
        .query((r, n) -> policy(r))
        .optional();
  }

  public void updatePolicy(String scope, Policy policy, String metadata) {
    int rows =
        jdbc.sql(
                "UPDATE people.leave_policy SET name=:name,paid=:paid,annual_quota=:quota,notice_days=:notice,max_days=:max,active=:active,metadata=CAST(:metadata AS jsonb),version=version+1,updated_at=now()"
                    + " WHERE scope_id=:scope AND policy_id=:id AND version=:version")
            .param("name", policy.name())
            .param("paid", policy.paid())
            .param("quota", policy.quota())
            .param("notice", policy.notice())
            .param("max", policy.maxDays())
            .param("active", policy.active())
            .param("metadata", metadata)
            .param("scope", scope)
            .param("id", policy.id())
            .param("version", policy.version())
            .update();
    if (rows != 1)
      throw COSError.conflict("POLICY_VERSION_CONFLICT", "This leave policy changed. Reload it.");
  }

  public Optional<EmployeeRef> findByCode(String scope, String code) {
    return jdbc.sql(
            "SELECT employee_id,employee_code,display_name FROM people.employee WHERE scope_id=:scope AND"
                + " lower(employee_code)=lower(:code)")
        .param("scope", scope)
        .param("code", code)
        .query(
            (r, n) ->
                new EmployeeRef(
                    r.getObject("employee_id", UUID.class),
                    r.getString("employee_code"),
                    r.getString("display_name")))
        .optional();
  }

  public EmployeeRef lockEmployee(String scope, UUID id) {
    return jdbc.sql(
            "SELECT employee_id,employee_code,display_name FROM people.employee WHERE scope_id=:scope AND employee_id=:id FOR UPDATE")
        .param("scope", scope)
        .param("id", id)
        .query(
            (r, n) ->
                new EmployeeRef(
                    r.getObject("employee_id", UUID.class),
                    r.getString("employee_code"),
                    r.getString("display_name")))
        .optional()
        .orElseThrow(COSError::missing);
  }

  public Optional<UUID> membership(String scope, String actor) {
    return jdbc.sql(
            "SELECT employee_id FROM people.employee_membership WHERE scope_id=:scope AND actor_id=:actor")
        .param("scope", scope)
        .param("actor", actor)
        .query(UUID.class)
        .optional();
  }

  public boolean overlaps(String scope, UUID employee, LocalDate start, LocalDate end, UUID except) {
    Long count =
        jdbc.sql(
                "SELECT count(*) FROM people.leave_request WHERE scope_id=:scope AND employee_id=:employee"
                    + " AND status IN ('SUBMITTED','APPROVED') AND start_on<=:end AND end_on>=:start"
                    + " AND (CAST(:except AS uuid) IS NULL OR request_id<>CAST(:except AS uuid))")
            .param("scope", scope)
            .param("employee", employee)
            .param("end", end)
            .param("start", start)
            .param("except", except == null ? null : except.toString(), java.sql.Types.VARCHAR)
            .query(Long.class)
            .single();
    return count != null && count > 0;
  }

  public BigDecimal reserved(String scope, UUID employee, UUID policy, int year) {
    return jdbc.sql(
            "SELECT coalesce(sum(day_count),0) FROM people.leave_request WHERE scope_id=:scope AND employee_id=:employee"
                + " AND policy_id=:policy AND status IN ('SUBMITTED','APPROVED') AND extract(year FROM start_on)=:year")
        .param("scope", scope)
        .param("employee", employee)
        .param("policy", policy)
        .param("year", year)
        .query(BigDecimal.class)
        .single();
  }

  public void insert(
      UUID id,
      String scope,
      UUID employee,
      UUID policy,
      LocalDate start,
      LocalDate end,
      BigDecimal days,
      String reason,
      String status,
      String actor) {
    jdbc.sql(
            "INSERT INTO people.leave_request(request_id,scope_id,employee_id,policy_id,start_on,end_on,day_count,reason,status,version,requested_by,reviewed_by,reviewed_at)"
                + " VALUES(:id,:scope,:employee,:policy,:start,:end,:days,:reason,:status,1,:actor,:reviewer,CASE WHEN :reviewer IS NULL THEN NULL ELSE now() END)")
        .param("id", id)
        .param("scope", scope)
        .param("employee", employee)
        .param("policy", policy)
        .param("start", start)
        .param("end", end)
        .param("days", days)
        .param("reason", reason)
        .param("status", status)
        .param("actor", actor)
        .param("reviewer", status.equals("APPROVED") ? actor : null, java.sql.Types.VARCHAR)
        .update();
  }

  public Optional<RequestRow> lockRequest(String scope, UUID id) {
    return jdbc.sql(
            "SELECT r.*, e.employee_code, e.display_name, p.code AS policy_code, p.name AS policy_name"
                + " FROM people.leave_request r JOIN people.employee e ON e.scope_id=r.scope_id AND e.employee_id=r.employee_id"
                + " JOIN people.leave_policy p ON p.scope_id=r.scope_id AND p.policy_id=r.policy_id"
                + " WHERE r.scope_id=:scope AND r.request_id=:id FOR UPDATE OF r")
        .param("scope", scope)
        .param("id", id)
        .query((r, n) -> request(r))
        .optional();
  }

  public List<RequestRow> requests(String scope, UUID employee) {
    return jdbc.sql(
            "SELECT r.*, e.employee_code, e.display_name, p.code AS policy_code, p.name AS policy_name"
                + " FROM people.leave_request r JOIN people.employee e ON e.scope_id=r.scope_id AND e.employee_id=r.employee_id"
                + " JOIN people.leave_policy p ON p.scope_id=r.scope_id AND p.policy_id=r.policy_id"
                + " WHERE r.scope_id=:scope AND (CAST(:employee AS uuid) IS NULL OR r.employee_id=CAST(:employee AS uuid))"
                + " ORDER BY r.created_at DESC LIMIT 100")
        .param("scope", scope)
        .param("employee", employee == null ? null : employee.toString(), java.sql.Types.VARCHAR)
        .query((r, n) -> request(r))
        .list();
  }

  public void transition(String scope, UUID id, int version, String status, String reviewer, String note) {
    int rows =
        jdbc.sql(
                "UPDATE people.leave_request SET status=:status,version=version+1,review_note=:note,reviewed_by=:reviewer,reviewed_at=now(),updated_at=now()"
                    + " WHERE scope_id=:scope AND request_id=:id AND version=:version AND status='SUBMITTED'")
            .param("status", status)
            .param("note", note, java.sql.Types.VARCHAR)
            .param("reviewer", reviewer)
            .param("scope", scope)
            .param("id", id)
            .param("version", version)
            .update();
    if (rows != 1)
      throw COSError.conflict(
          "LEAVE_VERSION_CONFLICT", "This leave request changed. Reload it before deciding.");
  }

  private Policy policy(java.sql.ResultSet r) throws java.sql.SQLException {
    return new Policy(
        r.getObject("policy_id", UUID.class),
        r.getString("code"),
        r.getString("name"),
        r.getBoolean("paid"),
        r.getBigDecimal("annual_quota"),
        r.getInt("notice_days"),
        r.getInt("max_days"),
        r.getBoolean("active"),
        r.getInt("version"),
        metadata(r.getString("metadata")));
  }

  private RequestRow request(java.sql.ResultSet r) throws java.sql.SQLException {
    return new RequestRow(
        r.getObject("request_id", UUID.class),
        r.getObject("employee_id", UUID.class),
        r.getString("employee_code"),
        r.getString("display_name"),
        r.getObject("policy_id", UUID.class),
        r.getString("policy_code"),
        r.getString("policy_name"),
        r.getObject("start_on", LocalDate.class),
        r.getObject("end_on", LocalDate.class),
        r.getBigDecimal("day_count"),
        r.getString("reason"),
        r.getString("status"),
        r.getInt("version"),
        r.getString("review_note"),
        r.getString("requested_by"),
        r.getTimestamp("created_at").toInstant().toString());
  }

  private Map<String, String> metadata(String raw) {
    var values = new LinkedHashMap<String, String>();
    JsonNode node = json.read(raw == null ? "{}" : raw, JsonNode.class);
    node.properties().forEach(entry -> values.put(entry.getKey(), entry.getValue().asString()));
    values.putIfAbsent("count_mode", "CALENDAR");
    return Map.copyOf(values);
  }
}
