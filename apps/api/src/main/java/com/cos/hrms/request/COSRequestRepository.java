package com.cos.hrms.request;

import com.cos.hrms.shared.COSError;
import com.cos.hrms.shared.COSJson;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class COSRequestRepository {
  public record Request(
      UUID id,
      String readable,
      String scope,
      String actor,
      String operation,
      UUID config,
      int version,
      String hash,
      String encrypted,
      String status,
      UUID employee,
      Integer expectedVersion,
      UUID preview,
      Instant submitted,
      String approver,
      String remarks,
      String failure,
      int attempts) {}

  public record Preview(
      UUID id,
      String scope,
      String actor,
      UUID config,
      String sourceHash,
      String snapshotHash,
      String mappingVersion,
      String name,
      String encrypted,
      int count,
      Instant expires) {}

  private final JdbcClient jdbc;
  private final COSJson json;
  private final RowMapper<Request> mapper =
      (r, n) ->
          new Request(
              r.getObject("request_id", UUID.class),
              r.getString("readable_id"),
              r.getString("scope_id"),
              r.getString("actor_id"),
              r.getString("operation"),
              r.getObject("config_id", UUID.class),
              r.getInt("request_version"),
              r.getString("payload_hash"),
              r.getString("payload_encrypted"),
              r.getString("status"),
              r.getObject("employee_key", UUID.class),
              r.getObject("expected_record_version", Integer.class),
              r.getObject("preview_id", UUID.class),
              r.getTimestamp("submitted_at").toInstant(),
              r.getString("approved_by"),
              r.getString("remarks"),
              r.getString("failure_code"),
              r.getInt("attempts"));

  public COSRequestRepository(JdbcClient jdbc, COSJson json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public Optional<Request> replay(String scope, String actor, String key) {
    return jdbc.sql(
            "SELECT * FROM integration.request WHERE scope_id=:scope AND actor_id=:actor AND"
                + " idempotency_key=:key")
        .param("scope", scope)
        .param("actor", actor)
        .param("key", key)
        .query(mapper)
        .optional();
  }

  public Request get(UUID id, String scope, boolean lock) {
    return jdbc.sql(
            "SELECT * FROM integration.request WHERE request_id=:id AND scope_id=:scope"
                + (lock ? " FOR UPDATE" : ""))
        .param("id", id)
        .param("scope", scope)
        .query(mapper)
        .optional()
        .orElseThrow(COSError::missing);
  }

  public List<Request> list(String scope, String actor, boolean admin, UUID after, int limit) {
    return jdbc.sql(
            "SELECT * FROM integration.request WHERE scope_id=:scope AND (:admin OR"
                + " actor_id=:actor) AND (:after IS NULL OR request_id>CAST(:after AS uuid)) ORDER"
                + " BY request_id LIMIT :limit")
        .param("scope", scope)
        .param("actor", actor)
        .param("admin", admin)
        .param("after", after == null ? null : after.toString(), java.sql.Types.VARCHAR)
        .param("limit", limit)
        .query(mapper)
        .list();
  }

  public List<Request> listConfiguration(
      String scope, String actor, boolean admin, UUID after, int limit) {
    return jdbc.sql(
            "SELECT * FROM integration.request WHERE scope_id=:scope AND operation='CONFIGURATION'"
                + " AND (:admin OR actor_id=:actor) AND (:after IS NULL OR request_id>CAST(:after"
                + " AS uuid)) ORDER BY request_id LIMIT :limit")
        .param("scope", scope)
        .param("actor", actor)
        .param("admin", admin)
        .param("after", after == null ? null : after.toString(), java.sql.Types.VARCHAR)
        .param("limit", limit)
        .query(mapper)
        .list();
  }

  public void insert(Request r, String key) {
    jdbc.sql(
            "INSERT INTO"
                + " integration.request(request_id,readable_id,scope_id,actor_id,operation,config_id,idempotency_key,payload_hash,payload_encrypted,status,employee_key,expected_record_version,preview_id)"
                + " VALUES(:id,:readable,:scope,:actor,:operation,:config,:key,:hash,:encrypted,'PENDING_APPROVAL',:employee,:version,:preview)")
        .param("id", r.id())
        .param("readable", r.readable())
        .param("scope", r.scope())
        .param("actor", r.actor())
        .param("operation", r.operation())
        .param("config", r.config())
        .param("key", key)
        .param("hash", r.hash())
        .param("encrypted", r.encrypted())
        .param("employee", r.employee(), java.sql.Types.OTHER)
        .param("version", r.expectedVersion(), java.sql.Types.INTEGER)
        .param("preview", r.preview(), java.sql.Types.OTHER)
        .update();
  }

  public void status(
      UUID id, String status, String approver, String remarks, String failure, boolean attempt) {
    jdbc.sql(
            "UPDATE integration.request SET"
                + " status=:status,approved_by=coalesce(:approver,approved_by),remarks=coalesce(:remarks,remarks),failure_code=:failure,attempts=attempts+:attempt"
                + " WHERE request_id=:id")
        .param("id", id)
        .param("status", status)
        .param("approver", approver, java.sql.Types.VARCHAR)
        .param("remarks", remarks, java.sql.Types.VARCHAR)
        .param("failure", failure, java.sql.Types.VARCHAR)
        .param("attempt", attempt ? 1 : 0)
        .update();
  }

  public void approval(Request r, String actor, String decision, String remarks) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO"
                + " integration.approval_event(approval_id,readable_id,request_id,request_version,actor_id,decision,remarks)"
                + " VALUES(:id,:readable,:request,:version,:actor,:decision,:remarks)")
        .param("id", id)
        .param("readable", "LOCAL-APR-" + id)
        .param("request", r.id())
        .param("version", r.version())
        .param("actor", actor)
        .param("decision", decision)
        .param("remarks", remarks)
        .update();
  }

  public void item(UUID request, int ordinal, UUID employee, String state, String error) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO"
                + " integration.request_item(request_item_id,readable_id,request_id,ordinal,employee_key,state,error_code)"
                + " VALUES(:id,:readable,:request,:ordinal,:employee,:state,:error) ON"
                + " CONFLICT(request_id,ordinal) DO UPDATE SET"
                + " employee_key=EXCLUDED.employee_key,state=EXCLUDED.state,error_code=EXCLUDED.error_code")
        .param("id", id)
        .param("readable", "LOCAL-ITEM-" + id)
        .param("request", request)
        .param("ordinal", ordinal)
        .param("employee", employee, java.sql.Types.OTHER)
        .param("state", state)
        .param("error", error, java.sql.Types.VARCHAR)
        .update();
  }

  public List<Map<String, Object>> items(UUID request) {
    return jdbc.sql(
            "SELECT ordinal,employee_key,state,error_code FROM integration.request_item WHERE"
                + " request_id=:request ORDER BY ordinal")
        .param("request", request)
        .query(
            (r, n) -> {
              Map<String, Object> row = new java.util.LinkedHashMap<>();
              row.put("source_row", r.getInt(1));
              row.put("employee_key", r.getString(2));
              row.put("state", r.getString(3));
              row.put("error_code", r.getString(4));
              return row;
            })
        .list();
  }

  public Optional<String> result(UUID request) {
    return jdbc.sql("SELECT result::text FROM integration.request_result WHERE request_id=:request")
        .param("request", request)
        .query(String.class)
        .optional();
  }

  public void result(Request request, Object value) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO integration.request_result(request_id,result_id,readable_id,result)"
                + " VALUES(:request,:id,:readable,CAST(:result AS jsonb))")
        .param("request", request.id())
        .param("id", id)
        .param("readable", "LOCAL-RES-" + id)
        .param("result", json.write(value))
        .update();
    UUID event = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO"
                + " integration.outbox_event(event_id,readable_id,request_id,event_type,payload)"
                + " VALUES(:id,:readable,:request,:type,CAST(:payload AS jsonb))")
        .param("id", event)
        .param("readable", "LOCAL-EVT-" + event)
        .param("request", request.id())
        .param("type", request.operation() + "_COMPLETED")
        .param("payload", json.write(Map.of("request_id", request.id(), "result_id", id)))
        .update();
  }

  public List<Map<String, String>> approved() {
    return jdbc.sql(
            "SELECT request_id,scope_id FROM integration.request WHERE status='APPROVED' AND"
                + " operation='CONFIGURATION' ORDER BY submitted_at LIMIT 20")
        .query((r, n) -> Map.of("id", r.getString(1), "scope", r.getString(2)))
        .list();
  }

  public void savePreview(Preview p) {
    jdbc.sql(
            "INSERT INTO"
                + " integration.import_preview(preview_id,readable_id,scope_id,actor_id,config_id,source_hash,snapshot_hash,mapping_version,source_name,input_method,snapshot_encrypted,row_count,expires_at)"
                + " VALUES(:id,:readable,:scope,:actor,:config,:source,:hash,:mapping,:name,'BULK_UPLOAD',:encrypted,:count,:expires)")
        .param("id", p.id())
        .param("readable", "LOCAL-PRE-" + p.id())
        .param("scope", p.scope())
        .param("actor", p.actor())
        .param("config", p.config())
        .param("source", p.sourceHash())
        .param("hash", p.snapshotHash())
        .param("mapping", p.mappingVersion())
        .param("name", p.name())
        .param("encrypted", p.encrypted())
        .param("count", p.count())
        .param("expires", java.sql.Timestamp.from(p.expires()))
        .update();
  }

  public Preview preview(UUID id, String scope) {
    return jdbc.sql(
            "SELECT * FROM integration.import_preview WHERE preview_id=:id AND scope_id=:scope")
        .param("id", id)
        .param("scope", scope)
        .query(
            (r, n) ->
                new Preview(
                    r.getObject("preview_id", UUID.class),
                    r.getString("scope_id"),
                    r.getString("actor_id"),
                    r.getObject("config_id", UUID.class),
                    r.getString("source_hash"),
                    r.getString("snapshot_hash"),
                    r.getString("mapping_version"),
                    r.getString("source_name"),
                    r.getString("snapshot_encrypted"),
                    r.getInt("row_count"),
                    r.getTimestamp("expires_at").toInstant()))
        .optional()
        .orElseThrow(COSError::missing);
  }

  public boolean previewUsed(UUID id) {
    return jdbc.sql("SELECT count(*) FROM integration.request WHERE preview_id=:id")
            .param("id", id)
            .query(Long.class)
            .single()
        > 0;
  }
}
