package com.cos.shared.registry;

import com.cos.shared.COSAuditService;
import com.cos.shared.COSCrypto;
import com.cos.shared.COSError;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.security.COSActor;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Typed values for a live employee. Called by PlatformController field-value routes. */
@Service
public class FieldValueService {
  private final JdbcClient jdbc;
  private final COSMetadataRepository configs;
  private final COSCrypto crypto;
  private final COSAuditService audit;

  public FieldValueService(
      JdbcClient jdbc, COSMetadataRepository configs, COSCrypto crypto, COSAuditService audit) {
    this.jdbc = jdbc;
    this.configs = configs;
    this.crypto = crypto;
    this.audit = audit;
  }

  public record ValueWrite(Map<String, String> values) {}

  public record StoredValue(
      String technical_name, String data_type, boolean sensitive, String value, int config_version) {}

  @Transactional(readOnly = true)
  public List<StoredValue> read(COSActor actor, UUID employee) {
    FieldRegistryService.read(actor);
    requireEmployee(actor.scope(), employee);
    return rows(actor.scope(), employee);
  }

  @Transactional
  public List<StoredValue> save(COSActor actor, UUID employee, ValueWrite input) {
    FieldRegistryService.read(actor);
    configs.lock(actor.scope());
    requireEmployee(actor.scope(), employee);
    if (input == null || input.values() == null || input.values().isEmpty() || input.values().size() > 100)
      throw new COSError(422, "FIELD_VALUES_INVALID", "Provide between 1 and 100 field values.");
    int version = configs.active(actor.scope()).metadata().version();
    var problems = new LinkedHashMap<String, String>();
    var pending = new ArrayList<Pending>();
    for (var entry : input.values().entrySet()) {
      var field = definition(actor.scope(), entry.getKey());
      if (field == null) {
        problems.put(entry.getKey(), "Register this field before storing a value.");
        continue;
      }
      try {
        pending.add(new Pending(field, canonical(field, entry.getValue())));
      } catch (COSError error) {
        problems.put(entry.getKey(), error.getMessage());
      }
    }
    if (!problems.isEmpty())
      throw new COSError(
          422, "FIELD_VALUES_INVALID", "Correct the field values and submit them again.", problems);
    for (Pending row : pending) store(actor, employee, version, row);
    audit.record(
        actor.scope(), actor.id(), null, "FIELD_VALUE_SAVED", employee.toString(), "COMPLETED");
    return rows(actor.scope(), employee);
  }

  private void store(COSActor actor, UUID employee, int version, Pending row) {
    String text = null;
    LocalDate date = null;
    BigDecimal number = null;
    String cipher = null;
    if (row.field.sensitive())
      cipher = crypto.encrypt(row.canonical, context(actor.scope(), employee, row.field.id()));
    else if (row.field.type().equals("date")) date = LocalDate.parse(row.canonical);
    else if (row.field.type().equals("number")) number = new BigDecimal(row.canonical);
    else text = row.canonical;
    jdbc.sql(
            "INSERT INTO people.employee_field_value(scope_id,employee_id,field_id,config_version,"
                + "value_text,value_date,value_number,value_ciphertext,updated_by) VALUES(:scope,"
                + ":employee,:field,:version,:text,:date,:number,:cipher,:actor) ON CONFLICT"
                + " (employee_id,field_id) DO UPDATE SET config_version=EXCLUDED.config_version,"
                + " value_text=EXCLUDED.value_text,value_date=EXCLUDED.value_date,value_number="
                + "EXCLUDED.value_number,value_ciphertext=EXCLUDED.value_ciphertext,updated_by="
                + "EXCLUDED.updated_by,updated_at=now()")
        .param("scope", actor.scope())
        .param("employee", employee)
        .param("field", row.field.id())
        .param("version", version)
        .param("text", text)
        .param("date", date)
        .param("number", number)
        .param("cipher", cipher)
        .param("actor", actor.id())
        .update();
  }

  private List<StoredValue> rows(String scope, UUID employee) {
    return jdbc.sql(
            "SELECT f.technical_name,f.data_type,f.sensitive,v.value_text,v.value_date,v.value_number,"
                + "v.value_ciphertext,v.config_version,v.field_id FROM people.employee_field_value v"
                + " JOIN meta.field_definition f ON f.field_id=v.field_id WHERE v.scope_id=:scope"
                + " AND v.employee_id=:employee ORDER BY f.technical_name")
        .param("scope", scope)
        .param("employee", employee)
        .query((r, n) -> present(scope, employee, r))
        .list();
  }

  private StoredValue present(String scope, UUID employee, ResultSet r) throws SQLException {
    String value;
    if (r.getBoolean(3))
      value = crypto.decrypt(r.getString(7), context(scope, employee, r.getObject(9, UUID.class)));
    else if (r.getString(4) != null) value = r.getString(4);
    else if (r.getDate(5) != null) value = r.getDate(5).toLocalDate().toString();
    else value = r.getBigDecimal(6).toPlainString();
    return new StoredValue(r.getString(1), r.getString(2), r.getBoolean(3), value, r.getInt(8));
  }

  private Definition definition(String scope, String name) {
    if (name == null || !name.matches("[a-z][a-z0-9_]{0,59}")) return null;
    return jdbc.sql(
            "SELECT field_id,data_type,sensitive FROM meta.field_definition WHERE scope_id=:scope"
                + " AND technical_name=:name")
        .param("scope", scope)
        .param("name", name)
        .query(
            (r, n) ->
                new Definition(r.getObject(1, UUID.class), name, r.getString(2), r.getBoolean(3)))
        .optional()
        .orElse(null);
  }

  private void requireEmployee(String scope, UUID employee) {
    Long count =
        jdbc.sql("SELECT count(*) FROM people.employee WHERE scope_id=:scope AND employee_id=:id")
            .param("scope", scope)
            .param("id", employee)
            .query(Long.class)
            .single();
    if (count == null || count == 0) throw COSError.missing();
  }

  private static String canonical(Definition field, String raw) {
    if (raw == null || raw.isBlank() || raw.length() > 2000)
      throw new COSError(422, "FIELD_VALUE_INVALID", "Provide a value of at most 2000 characters.");
    String value = raw.trim();
    try {
      if (field.type().equals("date")) return LocalDate.parse(value).toString();
      if (field.type().equals("number"))
        return new BigDecimal(value).stripTrailingZeros().toPlainString();
    } catch (DateTimeParseException | NumberFormatException e) {
      throw new COSError(
          422, "FIELD_TYPE_MISMATCH", "The value does not match the registered field type.");
    }
    return value;
  }

  private static String context(String scope, UUID employee, UUID field) {
    return scope + "/people-field/" + employee + "/" + field;
  }

  private record Definition(UUID id, String name, String type, boolean sensitive) {}

  private record Pending(Definition field, String canonical) {}
}
