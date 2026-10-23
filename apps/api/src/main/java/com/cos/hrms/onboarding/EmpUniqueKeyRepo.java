package com.cos.hrms.onboarding;

import com.cos.hrms.shared.COSJson;
import com.cos.shared.reg.UniqueKeyRule;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class EmpUniqueKeyRepo {
  public record Stored(UniqueKeyRule rule, Map<String,String> messages) {}
  private final JdbcClient jdbc;
  private final COSJson json;
  public EmpUniqueKeyRepo(JdbcClient jdbc, COSJson json) { this.jdbc=jdbc; this.json=json; }

  public boolean permitted(String scope, String actor, boolean write) {
    return jdbc.sql("""
        SELECT EXISTS(SELECT 1 FROM meta.key_admin_group g JOIN meta.key_admin_member m
        ON g.scope_id=m.scope_id AND g.group_id=m.group_id
        WHERE g.scope_id=:scope AND m.actor_id=:actor
        AND CASE WHEN :write THEN g.can_write ELSE g.can_read OR g.can_write END)
        """).param("scope",scope).param("actor",actor).param("write",write)
        .query(Boolean.class).single();
  }

  public Optional<Stored> active(String scope) {
    return jdbc.sql("""
        SELECT r.version,r.fields::text,r.messages::text FROM meta.unique_rule r
        JOIN meta.active_unique_rule a USING(scope_id,object_code,version)
        WHERE r.scope_id=:scope AND r.object_code='emp_reg'
        """).param("scope",scope).query((rs,n)->new Stored(
          new UniqueKeyRule(rs.getInt(1),List.of(json.read(rs.getString(2),UniqueKeyRule.Field[].class))),
          json.read(rs.getString(3),Messages.class).values())).optional();
  }

  public record Messages(Map<String,String> values) {}

  public void insertRule(String scope, String actor, UniqueKeyRule rule, Map<String,String> messages) {
    jdbc.sql("""
        INSERT INTO meta.unique_rule(scope_id,object_code,version,fields,messages,approved_by)
        VALUES(:scope,'emp_reg',:version,CAST(:fields AS jsonb),CAST(:messages AS jsonb),:actor)
        """).param("scope",scope).param("version",rule.version()).param("fields",json.write(rule.fields()))
        .param("messages",json.write(new Messages(messages))).param("actor",actor).update();
  }

  public void activate(String scope, int version) {
    jdbc.sql("""
        INSERT INTO meta.active_unique_rule(scope_id,object_code,version)
        VALUES(:scope,'emp_reg',:version)
        ON CONFLICT(scope_id,object_code) DO UPDATE SET version=EXCLUDED.version
        """).param("scope",scope).param("version",version).update();
  }

  public Optional<UUID> match(String scope, int version, String token) {
    return jdbc.sql("""
        SELECT employee_id FROM meta.unique_claim
        WHERE scope_id=:scope AND object_code='emp_reg' AND rule_version=:version AND key_token=:token
        """).param("scope",scope).param("version",version).param("token",token).query(UUID.class).optional();
  }

  public boolean claim(String scope, int version, String token, UUID employee) {
    return jdbc.sql("""
        INSERT INTO meta.unique_claim(scope_id,object_code,rule_version,key_token,employee_id)
        VALUES(:scope,'emp_reg',:version,:token,:employee) ON CONFLICT DO NOTHING
        """).param("scope",scope).param("version",version).param("token",token).param("employee",employee)
        .update()==1;
  }
}
