package com.cos.hrms.employee;

import com.cos.hrms.shared.COSError;
import com.cos.hrms.web.COSContracts.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class COSEmployeeRepository {
  public record Employee(
      UUID key,
      String scope,
      String id,
      String name,
      String father,
      String nationality,
      String idType,
      String ciphertext,
      String fingerprint,
      int version,
      Instant created) {}

  public record Value(String id, String type, String text, String ciphertext) {}

  private final JdbcClient jdbc;
  private final RowMapper<Employee> mapper =
      (r, n) ->
          new Employee(
              r.getObject("employee_key", UUID.class),
              r.getString("scope_id"),
              r.getString("sys_emp_id"),
              r.getString("employee_name"),
              r.getString("father_name"),
              r.getString("nationality_id"),
              r.getString("national_id_type_id"),
              r.getString("id_number_ciphertext"),
              r.getString("identity_fingerprint"),
              r.getInt("record_version"),
              r.getTimestamp("created_at").toInstant());

  public COSEmployeeRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public Employee get(UUID key, String scope) {
    return jdbc.sql(
            "SELECT * FROM core.employee_identity WHERE employee_key=:key AND scope_id=:scope")
        .param("key", key)
        .param("scope", scope)
        .query(mapper)
        .optional()
        .orElseThrow(COSError::missing);
  }

  public List<Employee> list(String scope, String search, UUID after, int limit) {
    return jdbc.sql(
            "SELECT * FROM core.employee_identity WHERE scope_id=:scope AND (employee_name ILIKE"
                + " :search OR sys_emp_id ILIKE :search) AND (:after IS NULL OR employee_key >"
                + " CAST(:after AS uuid)) ORDER BY employee_key LIMIT :limit")
        .param("scope", scope)
        .param(
            "search",
            "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
        .param("after", after == null ? null : after.toString(), java.sql.Types.VARCHAR)
        .param("limit", limit)
        .query(mapper)
        .list();
  }

  public boolean duplicate(String scope, String id, String fingerprint, UUID exclude) {
    return jdbc.sql(
                "SELECT count(*) FROM core.employee_identity WHERE scope_id=:scope AND"
                    + " (lower(sys_emp_id)=lower(:id) OR identity_fingerprint=:fingerprint) AND"
                    + " (:exclude IS NULL OR employee_key<>CAST(:exclude AS uuid))")
            .param("scope", scope)
            .param("id", id == null ? "" : id)
            .param("fingerprint", fingerprint)
            .param("exclude", exclude == null ? null : exclude.toString(), java.sql.Types.VARCHAR)
            .query(Long.class)
            .single()
        > 0;
  }

  public void insert(
      UUID key, String scope, String id, Registration p, String ciphertext, String fingerprint) {
    jdbc.sql(
            "INSERT INTO"
                + " core.employee_identity(employee_key,scope_id,sys_emp_id,employee_name,father_name,nationality_id,national_id_type_id,id_number_ciphertext,identity_fingerprint)"
                + " VALUES(:key,:scope,:id,:name,:father,CAST(:nationality AS uuid),CAST(:type AS"
                + " uuid),:ciphertext,:fingerprint)")
        .param("key", key)
        .param("scope", scope)
        .param("id", id)
        .param("name", p.employee_name().trim())
        .param("father", p.father_name().trim())
        .param("nationality", p.nationality_id())
        .param("type", p.national_id_type_id())
        .param("ciphertext", ciphertext)
        .param("fingerprint", fingerprint)
        .update();
  }

  public void update(Employee old, Registration p, String ciphertext, String fingerprint) {
    int changed =
        jdbc.sql(
                "UPDATE core.employee_identity SET"
                    + " employee_name=:name,father_name=:father,nationality_id=CAST(:nationality AS"
                    + " uuid),national_id_type_id=CAST(:type AS"
                    + " uuid),id_number_ciphertext=:ciphertext,identity_fingerprint=:fingerprint,record_version=record_version+1,updated_at=now()"
                    + " WHERE employee_key=:key AND scope_id=:scope AND record_version=:version")
            .param("key", old.key())
            .param("scope", old.scope())
            .param("name", p.employee_name().trim())
            .param("father", p.father_name().trim())
            .param("nationality", p.nationality_id())
            .param("type", p.national_id_type_id())
            .param("ciphertext", ciphertext)
            .param("fingerprint", fingerprint)
            .param("version", old.version())
            .update();
    if (changed != 1)
      throw COSError.conflict(
          "RECORD_VERSION_CONFLICT",
          "The employee changed. Fetch the current record and resubmit.");
  }

  public List<Value> values(UUID key) {
    return jdbc.sql(
            "SELECT"
                + " f.technical_name,f.data_type,coalesce(v.value_text,v.value_date::text,v.value_number::text),v.value_ciphertext"
                + " FROM core.employee_field_value v JOIN meta.field_definition f ON"
                + " f.field_id=v.field_id WHERE v.employee_key=:key")
        .param("key", key)
        .query((r, n) -> new Value(r.getString(1), r.getString(2), r.getString(3), r.getString(4)))
        .list();
  }

  public void saveValues(
      UUID key,
      UUID config,
      List<Field> fields,
      Map<String, String> values,
      java.util.function.BiFunction<String, String, String> encrypt) {
    for (Field field : fields) {
      if (!values.containsKey(field.id())) continue;
      String value = values.get(field.id());
      jdbc.sql("DELETE FROM core.employee_field_value WHERE employee_key=:key AND field_id=:field")
          .param("key", key)
          .param("field", UUID.fromString(field.field_id()))
          .update();
      if (value == null || value.isBlank()) continue;
      jdbc.sql(
              "INSERT INTO"
                  + " core.employee_field_value(employee_key,field_id,config_id,value_text,value_date,value_number,value_ciphertext)"
                  + " VALUES(:key,:field,:config,:text,:date,:number,:cipher)")
          .param("key", key)
          .param("field", UUID.fromString(field.field_id()))
          .param("config", config)
          .param(
              "text",
              !field.sensitive() && field.type().equals("text") ? value : null,
              java.sql.Types.VARCHAR)
          .param(
              "date",
              !field.sensitive() && field.type().equals("date") ? LocalDate.parse(value) : null,
              java.sql.Types.DATE)
          .param(
              "number",
              !field.sensitive() && field.type().equals("number") ? new BigDecimal(value) : null,
              java.sql.Types.NUMERIC)
          .param(
              "cipher",
              field.sensitive() ? encrypt.apply(value, field.id()) : null,
              java.sql.Types.VARCHAR)
          .update();
    }
  }
}
