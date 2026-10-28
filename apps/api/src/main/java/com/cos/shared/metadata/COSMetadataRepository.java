package com.cos.shared.metadata;

import com.cos.shared.COSError;
import com.cos.shared.COSJson;
import com.cos.shared.web.COSContracts.*;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class COSMetadataRepository {
  public record Config(UUID id, String scope, Metadata metadata) {}

  private final JdbcClient jdbc;
  private final COSJson json;

  public COSMetadataRepository(JdbcClient jdbc, COSJson json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public void lock(String scope) {
    if (jdbc.sql("SELECT scope_id FROM meta.scope WHERE scope_id=:scope FOR UPDATE")
        .param("scope", scope)
        .query(String.class)
        .optional()
        .isEmpty()) throw COSError.forbidden();
  }

  public String scopeLabel(String scope) {
    return jdbc.sql("SELECT label FROM meta.scope WHERE scope_id=:scope")
        .param("scope", scope)
        .query(String.class)
        .optional()
        .orElse(scope);
  }

  public boolean scopeExists(String scope) {
    return jdbc.sql("SELECT count(*) FROM meta.scope WHERE scope_id=:scope")
            .param("scope", scope)
            .query(Long.class)
            .single()
        > 0;
  }

  public void createScope(String scope) {
    jdbc.sql(
            "INSERT INTO meta.scope(scope_id,scope_key,readable_id,label)"
                + " VALUES(:scope,:id,:readable,'Local development only') ON CONFLICT DO NOTHING")
        .param("scope", scope)
        .param("id", UUID.randomUUID())
        .param("readable", "LOCAL-SCOPE-" + scope)
        .update();
    jdbc.sql("INSERT INTO meta.id_counter(scope_id) VALUES(:scope) ON CONFLICT DO NOTHING")
        .param("scope", scope)
        .update();
  }

  public Config active(String scope) {
    return jdbc.sql(
            "SELECT c.config_id,c.scope_id,c.body::text FROM meta.component_config c JOIN"
                + " meta.active_config a ON a.config_id=c.config_id WHERE a.scope_id=:scope")
        .param("scope", scope)
        .query(
            (r, n) ->
                new Config(
                    r.getObject(1, UUID.class),
                    r.getString(2),
                    json.read(r.getString(3), Metadata.class)))
        .optional()
        .orElseThrow(COSError::missing);
  }

  public Config config(UUID id, String scope) {
    return jdbc.sql(
            "SELECT config_id,scope_id,body::text FROM meta.component_config WHERE config_id=:id"
                + " AND scope_id=:scope")
        .param("id", id)
        .param("scope", scope)
        .query(
            (r, n) ->
                new Config(
                    r.getObject(1, UUID.class),
                    r.getString(2),
                    json.read(r.getString(3), Metadata.class)))
        .optional()
        .orElseThrow(COSError::missing);
  }

  public void publish(String scope, Metadata metadata, String actor) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO"
                + " meta.component_config(config_id,readable_id,scope_id,version,body,approved_by)"
                + " VALUES(:id,:readable,:scope,:version,CAST(:body AS jsonb),:actor)")
        .param("id", id)
        .param("readable", "LOCAL-CFG-" + id)
        .param("scope", scope)
        .param("version", metadata.version())
        .param("body", json.write(metadata))
        .param("actor", actor)
        .update();
    for (Field f : metadata.fields()) {
      UUID field_id = UUID.fromString(f.field_id());
      jdbc.sql(
              "INSERT INTO meta.field_definition(field_id,readable_id,scope_id,technical_name,"
                  + "data_type,label,sensitive) VALUES(:id,:readable,:scope,:name,:type,:label,"
                  + ":sensitive) ON CONFLICT(scope_id,technical_name) DO UPDATE SET sensitive ="
                  + " meta.field_definition.sensitive OR EXCLUDED.sensitive")
          .param("id", field_id)
          .param("readable", "LOCAL-FLD-" + field_id)
          .param("scope", scope)
          .param("name", f.id())
          .param("type", f.type())
          .param("label", f.label())
          .param("sensitive", f.sensitive())
          .update();
      jdbc.sql(
              "INSERT INTO meta.component_field(config_id,field_id,required,display_order,policy)"
                  + " VALUES(:config,:field,:required,:display,CAST(:policy AS jsonb))")
          .param("config", id)
          .param("field", field_id)
          .param("required", f.required())
          .param("display", f.display_order())
          .param("policy", json.write(f))
          .update();
    }
    jdbc.sql(
            "INSERT INTO meta.active_config(scope_id,config_id) VALUES(:scope,:id) ON"
                + " CONFLICT(scope_id) DO UPDATE SET config_id=EXCLUDED.config_id")
        .param("scope", scope)
        .param("id", id)
        .update();
  }

  public List<Choice> choices(String scope) {
    return jdbc.sql(
            "SELECT value_id,code,label,category FROM meta.controlled_value WHERE scope_id=:scope"
                + " AND active ORDER BY category,label")
        .param("scope", scope)
        .query((r, n) -> new Choice(r.getString(1), r.getString(2), r.getString(3), r.getString(4)))
        .list();
  }

  public void addChoice(String scope, String category, String code, String label) {
    UUID id =
        UUID.nameUUIDFromBytes(
            (scope + ":" + category + ":" + code)
                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
    jdbc.sql(
            "INSERT INTO meta.controlled_value(value_id,readable_id,scope_id,category,code,label)"
                + " VALUES(:id,:readable,:scope,:category,:code,:label) ON CONFLICT DO NOTHING")
        .param("id", id)
        .param("readable", "LOCAL-CV-" + id)
        .param("scope", scope)
        .param("category", category)
        .param("code", code)
        .param("label", label)
        .update();
  }

  public long allocate(String scope) {
    return jdbc.sql(
            "UPDATE meta.id_counter SET next_value=next_value+1 WHERE scope_id=:scope RETURNING"
                + " next_value")
        .param("scope", scope)
        .query(Long.class)
        .single();
  }
}
