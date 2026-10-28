package com.cos.shared.registry;

import com.cos.shared.COSCrypto;
import com.cos.shared.COSError;
import com.cos.shared.security.COSActor;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read models over registered tables and live employees. Called by PlatformController report routes. */
@Service
public class ReportService {
  private final JdbcClient jdbc;
  private final COSCrypto crypto;
  private final FieldRegistryService registry;

  public ReportService(JdbcClient jdbc, COSCrypto crypto, FieldRegistryService registry) {
    this.jdbc = jdbc;
    this.crypto = crypto;
    this.registry = registry;
  }

  public record MasterRow(
      String employee_id,
      String employee_code,
      String display_name,
      String work_email,
      String sys_emp_id,
      String rzp_id,
      String attendo_id) {}

  public record TableReport(String table, String grain, List<String> columns, List<Map<String, String>> rows) {}

  @Transactional(readOnly = true)
  public List<MasterRow> employeeMaster(COSActor actor) {
    FieldRegistryService.read(actor);
    return jdbc.sql(
            "SELECT e.employee_id,e.employee_code,e.display_name,e.work_email,sys.external_id,"
                + "rzp.external_id,att.external_id FROM people.employee e LEFT JOIN"
                + " people.identity_link sys ON sys.scope_id=e.scope_id AND"
                + " sys.employee_id=e.employee_id AND sys.system_code='SYS' AND sys.valid_to IS NULL"
                + " LEFT JOIN people.identity_link rzp ON rzp.scope_id=e.scope_id AND"
                + " rzp.employee_id=e.employee_id AND rzp.system_code='RZP' AND rzp.valid_to IS NULL"
                + " LEFT JOIN people.identity_link att ON att.scope_id=e.scope_id AND"
                + " att.employee_id=e.employee_id AND att.system_code='ATTENDO' AND att.valid_to IS"
                + " NULL WHERE e.scope_id=:scope ORDER BY e.employee_code")
        .param("scope", actor.scope())
        .query(
            (r, n) ->
                new MasterRow(
                    r.getObject(1, UUID.class).toString(),
                    r.getString(2),
                    r.getString(3),
                    r.getString(4),
                    r.getString(5),
                    r.getString(6),
                    r.getString(7)))
        .list();
  }

  @Transactional(readOnly = true)
  public TableReport table(COSActor actor, String technicalName) {
    FieldRegistryService.read(actor);
    if (technicalName == null || !technicalName.matches("[A-Za-z][A-Za-z0-9_]{0,63}"))
      throw COSError.missing();
    var table = registry.findTable(actor.scope(), technicalName);
    if (table == null) throw COSError.missing();
    if (table.grain().equals("CATALOG")) return catalog(actor.scope(), table);
    return employees(actor.scope(), table);
  }

  private TableReport catalog(String scope, FieldRegistryService.TableView table) {
    var rows = new ArrayList<Map<String, String>>();
    for (String name : table.fields()) {
      rows.add(
          jdbc.sql(
                  "SELECT label,data_type,sensitive FROM meta.field_definition WHERE scope_id=:scope"
                      + " AND technical_name=:name")
              .param("scope", scope)
              .param("name", name)
              .query(
                  (r, n) -> {
                    var row = new LinkedHashMap<String, String>();
                    row.put("technical_name", name);
                    row.put("label", r.getString(1));
                    row.put("data_type", r.getString(2));
                    row.put("sensitive", Boolean.toString(r.getBoolean(3)));
                    return row;
                  })
              .single());
    }
    return new TableReport(
        table.technical_name(),
        table.grain(),
        List.of("technical_name", "label", "data_type", "sensitive"),
        rows);
  }

  private TableReport employees(String scope, FieldRegistryService.TableView table) {
    var columns = new ArrayList<String>();
    columns.add("employee_code");
    columns.add("display_name");
    columns.addAll(table.fields());
    var people =
        jdbc.sql(
                "SELECT employee_id,employee_code,display_name FROM people.employee WHERE"
                    + " scope_id=:scope ORDER BY employee_code")
            .param("scope", scope)
            .query((r, n) -> new Person(r.getObject(1, UUID.class), r.getString(2), r.getString(3)))
            .list();
    var rows = new ArrayList<Map<String, String>>();
    for (Person person : people) {
      var row = new LinkedHashMap<String, String>();
      row.put("employee_code", person.code());
      row.put("display_name", person.name());
      for (String field : table.fields()) row.put(field, value(scope, person.id(), field));
      rows.add(row);
    }
    return new TableReport(table.technical_name(), table.grain(), columns, rows);
  }

  private String value(String scope, UUID employee, String field) {
    return jdbc.sql(
            "SELECT f.sensitive,v.value_text,v.value_date,v.value_number,v.value_ciphertext,v.field_id"
                + " FROM people.employee_field_value v JOIN meta.field_definition f ON"
                + " f.field_id=v.field_id WHERE v.scope_id=:scope AND v.employee_id=:employee AND"
                + " f.technical_name=:name")
        .param("scope", scope)
        .param("employee", employee)
        .param("name", field)
        .query(
            (r, n) -> {
              if (r.getBoolean(1))
                return crypto.decrypt(
                    r.getString(5),
                    scope + "/people-field/" + employee + "/" + r.getObject(6, UUID.class));
              if (r.getString(2) != null) return r.getString(2);
              if (r.getDate(3) != null) return r.getDate(3).toLocalDate().toString();
              return r.getBigDecimal(4) == null ? "" : r.getBigDecimal(4).toPlainString();
            })
        .optional()
        .orElse("");
  }

  private record Person(UUID id, String code, String name) {}
}
