package com.cos.shared.registry;

import com.cos.shared.COSAuditService;
import com.cos.shared.COSError;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.security.COSActor;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Sync status for a source row. An absent row does not delete the employee. */
@Service
public class SyncService {
  private final JdbcClient jdbc;
  private final COSMetadataRepository configs;
  private final COSAuditService audit;

  public SyncService(JdbcClient jdbc, COSMetadataRepository configs, COSAuditService audit) {
    this.jdbc = jdbc;
    this.configs = configs;
    this.audit = audit;
  }

  public record SyncWrite(
      String source_name,
      String source_key,
      String sync_id,
      String sync_status,
      String target_kind,
      String target_key) {}

  public record Absence(
      String source_name, String source_key, String sync_id, String target_kind, String target_key) {}

  public record SyncView(
      String sync_row_id,
      String source_name,
      String source_key,
      String sync_id,
      String sync_status,
      int sync_version,
      String target_kind,
      String target_key) {}

  public record AbsenceResult(SyncView sync, long employee_count) {}

  @Transactional
  public SyncView record(COSActor actor, SyncWrite input) {
    FieldRegistryService.read(actor);
    configs.lock(actor.scope());
    if (input == null
        || input.sync_status() == null
        || !Set.of("SYNCED", "CONFLICT").contains(input.sync_status()))
      throw new COSError(422, "SYNC_INVALID", "Record a sync as SYNCED or CONFLICT.");
    String kind = kind(input.target_kind());
    String target = token(input.target_key(), 80, "target key");
    requireTarget(actor.scope(), kind, target);
    var saved =
        upsert(
            actor,
            token(input.source_name(), 80, "source name"),
            token(input.source_key(), 160, "source key"),
            token(input.sync_id(), 80, "sync id"),
            input.sync_status(),
            kind,
            target);
    audit.record(actor.scope(), actor.id(), null, "SYNC_RECORDED", saved.sync_row_id(), "COMPLETED");
    return saved;
  }

  @Transactional
  public AbsenceResult markAbsent(COSActor actor, Absence input) {
    FieldRegistryService.read(actor);
    configs.lock(actor.scope());
    if (input == null) throw new COSError(422, "SYNC_INVALID", "Name the source row that is absent.");
    long before = employees(actor.scope());
    String kind = kind(input.target_kind());
    String target = token(input.target_key(), 80, "target key");
    requireTarget(actor.scope(), kind, target);
    var saved =
        upsert(
            actor,
            token(input.source_name(), 80, "source name"),
            token(input.source_key(), 160, "source key"),
            token(input.sync_id(), 80, "sync id"),
            "ABSENT",
            kind,
            target);
    long after = employees(actor.scope());
    if (before != after)
      throw new IllegalStateException("An absent source row must leave every employee in place.");
    audit.record(actor.scope(), actor.id(), null, "SYNC_ABSENT", saved.sync_row_id(), "COMPLETED");
    return new AbsenceResult(saved, after);
  }

  private SyncView upsert(
      COSActor actor,
      String source,
      String sourceKey,
      String syncId,
      String status,
      String kind,
      String target) {
    UUID id = UUID.randomUUID();
    return jdbc.sql(
            "INSERT INTO integration.sync_record(sync_row_id,readable_id,scope_id,source_name,"
                + "source_key,sync_id,sync_status,sync_version,target_kind,target_key,recorded_by)"
                + " VALUES(:id,:readable,:scope,:source,:key,:sync,:status,1,:kind,:target,:actor) ON"
                + " CONFLICT(scope_id,source_name,source_key) DO UPDATE SET sync_id=EXCLUDED.sync_id,"
                + "sync_status=EXCLUDED.sync_status,sync_version=integration.sync_record.sync_version"
                + "+1,target_kind=EXCLUDED.target_kind,target_key=EXCLUDED.target_key,recorded_by="
                + "EXCLUDED.recorded_by,recorded_at=now() RETURNING sync_row_id,source_name,"
                + "source_key,sync_id,sync_status,sync_version,target_kind,target_key")
        .param("id", id)
        .param("readable", "LOCAL-SYNC-" + id)
        .param("scope", actor.scope())
        .param("source", source)
        .param("key", sourceKey)
        .param("sync", syncId)
        .param("status", status)
        .param("kind", kind)
        .param("target", target)
        .param("actor", actor.id())
        .query(
            (r, n) ->
                new SyncView(
                    r.getObject(1, UUID.class).toString(),
                    r.getString(2),
                    r.getString(3),
                    r.getString(4),
                    r.getString(5),
                    r.getInt(6),
                    r.getString(7),
                    r.getString(8)))
        .single();
  }

  private void requireTarget(String scope, String kind, String target) {
    UUID id = parse(target);
    long found =
        switch (kind) {
          case "EMPLOYEE" ->
              count(
                  "SELECT count(*) FROM people.employee WHERE scope_id=:scope AND employee_id=:id",
                  scope,
                  id);
          case "FIELD" ->
              count(
                  "SELECT count(*) FROM meta.field_definition WHERE scope_id=:scope AND field_id=:id",
                  scope,
                  id);
          case "TABLE" ->
              count(
                  "SELECT count(*) FROM meta.data_table WHERE scope_id=:scope AND table_id=:id",
                  scope,
                  id);
          default -> 0;
        };
    if (found == 0) throw COSError.missing();
  }

  private long count(String sql, String scope, UUID id) {
    Long count = jdbc.sql(sql).param("scope", scope).param("id", id).query(Long.class).single();
    return count == null ? 0 : count;
  }

  private long employees(String scope) {
    Long count =
        jdbc.sql("SELECT count(*) FROM people.employee WHERE scope_id=:scope")
            .param("scope", scope)
            .query(Long.class)
            .single();
    return count == null ? 0 : count;
  }

  private static UUID parse(String value) {
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException | NullPointerException e) {
      throw new COSError(422, "SYNC_TARGET_INVALID", "Name the synced record with its id.");
    }
  }

  private static String kind(String value) {
    if (value == null || !Set.of("EMPLOYEE", "FIELD", "TABLE").contains(value))
      throw new COSError(422, "SYNC_INVALID", "A sync target is an employee, a field, or a table.");
    return value;
  }

  private static String token(String value, int max, String name) {
    if (value == null || value.isBlank() || value.trim().length() > max)
      throw new COSError(
          422, "SYNC_INVALID", "Provide a " + name + " of at most " + max + " characters.");
    return value.trim();
  }
}
