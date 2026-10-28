package com.cos.shared.registry;

import com.cos.shared.COSAuditService;
import com.cos.shared.COSError;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.security.COSActor;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Shared field and table registry. Called by PlatformController field and table routes, and by
 * ReportService.table. Writes meta.field_definition, meta.data_table, and meta.table_field.
 */
@Service
public class FieldRegistryService {
  static final Set<String> RESERVED =
      Set.of(
          "sys_emp_id",
          "employee_name",
          "father_name",
          "nationality_id",
          "national_id_type_id",
          "id_number",
          "empid_entry_mode");

  private final JdbcClient jdbc;
  private final COSMetadataRepository configs;
  private final COSAuditService audit;

  public FieldRegistryService(
      JdbcClient jdbc, COSMetadataRepository configs, COSAuditService audit) {
    this.jdbc = jdbc;
    this.configs = configs;
    this.audit = audit;
  }

  public record FieldRegistration(
      String technical_name, String label, String data_type, boolean sensitive) {}

  public record FieldView(
      String field_id,
      String technical_name,
      String label,
      String data_type,
      boolean sensitive,
      List<String> tables) {}

  public record TableRegistration(
      String technical_name, String label, String grain, List<String> fields) {}

  public record TableView(
      String table_id, String technical_name, String label, String grain, List<String> fields) {}

  @Transactional(readOnly = true)
  public List<FieldView> listFields(COSActor actor) {
    read(actor);
    return fields(actor.scope());
  }

  @Transactional
  public FieldView registerField(COSActor actor, FieldRegistration input) {
    configure(actor);
    configs.lock(actor.scope());
    String name = technical(input.technical_name());
    String type = type(input.data_type());
    String label = label(input.label());
    var existing = find(actor.scope(), name);
    if (existing != null) {
      if (!existing.data_type().equals(type))
        throw COSError.conflict(
            "FIELD_TYPE_CONFLICT",
            "This field is already registered with a different type. Reuse it or correct the spelling.");
      if (existing.sensitive() != input.sensitive())
        throw COSError.conflict(
            "FIELD_SENSITIVITY_CONFLICT",
            "This field is already registered with a different sensitivity. Reuse the registered field.");
      return existing;
    }
    UUID id =
        UUID.nameUUIDFromBytes((actor.scope() + ":" + name).getBytes(StandardCharsets.UTF_8));
    jdbc.sql(
            "INSERT INTO meta.field_definition(field_id,readable_id,scope_id,technical_name,data_type,"
                + "label,sensitive) VALUES(:id,:readable,:scope,:name,:type,:label,:sensitive)")
        .param("id", id)
        .param("readable", "LOCAL-FLD-" + id)
        .param("scope", actor.scope())
        .param("name", name)
        .param("type", type)
        .param("label", label)
        .param("sensitive", input.sensitive())
        .update();
    audit.record(actor.scope(), actor.id(), null, "FIELD_REGISTERED", name, "COMPLETED");
    return find(actor.scope(), name);
  }

  @Transactional(readOnly = true)
  public List<TableView> listTables(COSActor actor) {
    read(actor);
    return tables(actor.scope());
  }

  @Transactional
  public TableView registerTable(COSActor actor, TableRegistration input) {
    configure(actor);
    configs.lock(actor.scope());
    String name = tableName(input.technical_name());
    String grain = grain(input.grain());
    String label = label(input.label());
    if (input.fields() == null || input.fields().isEmpty() || input.fields().size() > 100)
      throw new COSError(422, "TABLE_FIELDS_INVALID", "Name between 1 and 100 registered fields.");
    var ordered = new LinkedHashSet<String>();
    var missing = new LinkedHashMap<String, String>();
    var ids = new ArrayList<UUID>();
    for (String column : input.fields()) {
      String technical = technical(column);
      if (!ordered.add(technical))
        throw new COSError(
            422, "TABLE_FIELDS_INVALID", "Each registered field can appear once on a table.");
      var field = find(actor.scope(), technical);
      if (field == null) missing.put(technical, "Register this field before registering the table.");
      else ids.add(UUID.fromString(field.field_id()));
    }
    if (!missing.isEmpty())
      throw new COSError(
          422,
          "TABLE_FIELDS_UNREGISTERED",
          "Register every column as a field before registering the table.",
          missing);
    var current = findTable(actor.scope(), name);
    if (current != null) {
      if (!current.grain().equals(grain) || !current.fields().equals(List.copyOf(ordered)))
        throw COSError.conflict(
            "TABLE_MAPPING_CONFLICT",
            "This table is already registered with a different field mapping.");
      return current;
    }
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO meta.data_table(table_id,readable_id,scope_id,technical_name,label,grain,"
                + "registered_by) VALUES(:id,:readable,:scope,:name,:label,:grain,:actor)")
        .param("id", id)
        .param("readable", "LOCAL-TBL-" + id)
        .param("scope", actor.scope())
        .param("name", name)
        .param("label", label)
        .param("grain", grain)
        .param("actor", actor.id())
        .update();
    int order = 0;
    for (UUID field : ids) {
      jdbc.sql(
              "INSERT INTO meta.table_field(table_id,field_id,scope_id,display_order)"
                  + " VALUES(:table,:field,:scope,:order)")
          .param("table", id)
          .param("field", field)
          .param("scope", actor.scope())
          .param("order", order++)
          .update();
    }
    audit.record(actor.scope(), actor.id(), null, "TABLE_REGISTERED", name, "COMPLETED");
    return findTable(actor.scope(), name);
  }

  private List<FieldView> fields(String scope) {
    return jdbc.sql(
            "SELECT f.field_id,f.technical_name,f.label,f.data_type,f.sensitive,"
                + " COALESCE(array_agg(t.technical_name ORDER BY t.technical_name)"
                + " FILTER (WHERE t.technical_name IS NOT NULL), '{}') FROM meta.field_definition f"
                + " LEFT JOIN meta.table_field tf ON tf.field_id=f.field_id LEFT JOIN meta.data_table"
                + " t ON t.table_id=tf.table_id WHERE f.scope_id=:scope GROUP BY"
                + " f.field_id,f.technical_name,f.label,f.data_type,f.sensitive ORDER BY"
                + " f.technical_name")
        .param("scope", scope)
        .query((r, n) -> field(r))
        .list();
  }

  private FieldView find(String scope, String name) {
    return jdbc.sql(
            "SELECT f.field_id,f.technical_name,f.label,f.data_type,f.sensitive,"
                + " COALESCE(array_agg(t.technical_name ORDER BY t.technical_name)"
                + " FILTER (WHERE t.technical_name IS NOT NULL), '{}') FROM meta.field_definition f"
                + " LEFT JOIN meta.table_field tf ON tf.field_id=f.field_id LEFT JOIN meta.data_table"
                + " t ON t.table_id=tf.table_id WHERE f.scope_id=:scope AND f.technical_name=:name"
                + " GROUP BY f.field_id,f.technical_name,f.label,f.data_type,f.sensitive")
        .param("scope", scope)
        .param("name", name)
        .query((r, n) -> field(r))
        .optional()
        .orElse(null);
  }

  private static FieldView field(ResultSet r) throws SQLException {
    var tables = r.getArray(6);
    List<String> names = tables == null ? List.of() : List.of((String[]) tables.getArray());
    return new FieldView(
        r.getObject(1, UUID.class).toString(),
        r.getString(2),
        r.getString(3),
        r.getString(4),
        r.getBoolean(5),
        names);
  }

  private List<TableView> tables(String scope) {
    return jdbc.sql(
            "SELECT technical_name FROM meta.data_table WHERE scope_id=:scope ORDER BY technical_name")
        .param("scope", scope)
        .query((r, n) -> findTable(scope, r.getString(1)))
        .list();
  }

  TableView findTable(String scope, String name) {
    return jdbc.sql(
            "SELECT t.table_id,t.technical_name,t.label,t.grain,"
                + " COALESCE(array_agg(f.technical_name ORDER BY tf.display_order)"
                + " FILTER (WHERE f.technical_name IS NOT NULL), '{}') FROM meta.data_table t"
                + " LEFT JOIN meta.table_field tf ON tf.table_id=t.table_id LEFT JOIN"
                + " meta.field_definition f ON f.field_id=tf.field_id WHERE t.scope_id=:scope AND"
                + " t.technical_name=:name GROUP BY t.table_id,t.technical_name,t.label,t.grain")
        .param("scope", scope)
        .param("name", name)
        .query(
            (r, n) -> {
              var fields = r.getArray(5);
              List<String> names = fields == null ? List.of() : List.of((String[]) fields.getArray());
              return new TableView(
                  r.getObject(1, UUID.class).toString(),
                  r.getString(2),
                  r.getString(3),
                  r.getString(4),
                  names);
            })
        .optional()
        .orElse(null);
  }

  private static void configure(COSActor actor) {
    if (!actor.admin()) throw COSError.forbidden();
  }

  static void read(COSActor actor) {
    if (!actor.admin() && !actor.roles().contains("REGISTRAR")) throw COSError.forbidden();
  }

  private static String technical(String value) {
    if (value == null || !value.matches("[a-z][a-z0-9_]{0,59}") || RESERVED.contains(value))
      throw new COSError(
          422, "FIELD_ID_INVALID", "Use a unique lowercase field name that is not a core identifier.");
    return value;
  }

  private static String type(String value) {
    if (value == null || !Set.of("text", "date", "number").contains(value))
      throw new COSError(422, "FIELD_DEFINITION_INVALID", "Use text, date, or number.");
    return value;
  }

  private static String tableName(String value) {
    if (value == null || !value.matches("[A-Za-z][A-Za-z0-9_]{0,63}"))
      throw new COSError(
          422, "TABLE_NAME_INVALID", "Use a table name of letters, digits, and underscores.");
    return value;
  }

  private static String grain(String value) {
    if (value == null || !Set.of("EMPLOYEE", "CATALOG").contains(value))
      throw new COSError(
          422, "TABLE_GRAIN_INVALID", "A table is either an employee projection or a catalog.");
    return value;
  }

  private static String label(String value) {
    if (value == null || value.isBlank() || value.trim().length() > 80)
      throw new COSError(422, "FIELD_DEFINITION_INVALID", "Provide a label of at most 80 characters.");
    return value.trim();
  }
}
