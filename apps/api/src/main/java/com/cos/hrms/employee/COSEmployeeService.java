package com.cos.hrms.employee;

import com.cos.hrms.config.COSProperties;
import com.cos.hrms.metadata.COSMetadataRepository;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.*;
import com.cos.hrms.web.COSContracts.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service
public class COSEmployeeService {
  private final COSEmployeeRepository employees;
  private final COSMetadataRepository metadata;
  private final COSCrypto crypto;
  private final COSJson json;
  private final COSProperties properties;
  private final COSAuditService audit;

  public COSEmployeeService(
      COSEmployeeRepository employees,
      COSMetadataRepository metadata,
      COSCrypto crypto,
      COSJson json,
      COSProperties properties,
      COSAuditService audit) {
    this.employees = employees;
    this.metadata = metadata;
    this.crypto = crypto;
    this.json = json;
    this.properties = properties;
    this.audit = audit;
  }

  public Registration validate(
      JsonNode node,
      COSMetadataRepository.Config config,
      COSActor actor,
      COSEmployeeRepository.Employee old) {
    requireObject(
        node,
        Set.of(
            "employee_name",
            "empid_entry_mode",
            "sys_emp_id",
            "father_name",
            "nationality_id",
            "national_id_type_id",
            "id_number",
            "custom_fields"));
    var errors = new LinkedHashMap<String, String>();
    for (String key :
        List.of(
            "employee_name",
            "father_name",
            "nationality_id",
            "national_id_type_id",
            "empid_entry_mode"))
      if (!node.path(key).isString() || node.path(key).asText().isBlank())
        errors.put(key, "A nonblank text value is required.");
    for (String key : List.of("employee_name", "father_name", "id_number"))
      if (node.hasNonNull(key)
          && (!node.get(key).isString() || node.get(key).asText().length() > 120))
        errors.put(key, "Use text of at most 120 characters.");
    if (node.hasNonNull("sys_emp_id") && !node.get("sys_emp_id").isString())
      errors.put("sys_emp_id", "Employee IDs must be text to preserve their exact value.");
    String mode = node.path("empid_entry_mode").asText();
    String id = node.hasNonNull("sys_emp_id") ? node.get("sys_emp_id").asText().trim() : null;
    if (!config.metadata().allowed_modes().contains(mode))
      errors.put("empid_entry_mode", "Choose an allowed Manual or Auto mode.");
    if (mode.equals("AUTO") && node.has("sys_emp_id"))
      errors.put("sys_emp_id", "Auto mode must not supply an employee ID.");
    if (mode.equals("MANUAL") && (id == null || !id.matches(properties.getManualIdPattern())))
      errors.put("sys_emp_id", "The manual employee ID does not match the configured text format.");
    String identifier = node.hasNonNull("id_number") ? node.get("id_number").asText().trim() : null;
    if (old != null) {
      if (!mode.equals("MANUAL") || !old.id().equals(id))
        errors.put("sys_emp_id", "An employee ID cannot be changed through a normal update.");
      if (identifier == null || identifier.isBlank())
        identifier = crypto.decrypt(old.ciphertext(), old.scope() + "/identity/" + old.key());
    }
    if (identifier == null || identifier.isBlank() || identifier.startsWith("•"))
      errors.put(
          "id_number",
          "Enter an identifier; masked values cannot be submitted as new identifiers.");
    var choices = metadata.choices(actor.scope());
    for (var pair :
        Map.of("nationality_id", "NATIONALITY", "national_id_type_id", "ID_TYPE").entrySet())
      if (choices.stream()
          .noneMatch(
              c ->
                  c.category().equals(pair.getValue())
                      && c.id().equals(node.path(pair.getKey()).asText())))
        errors.put(pair.getKey(), "Select an active controlled value.");
    var custom = new LinkedHashMap<String, String>();
    if (node.hasNonNull("custom_fields")) {
      if (!node.get("custom_fields").isObject() || node.get("custom_fields").size() > 100)
        throw new COSError(
            422, "CUSTOM_FIELDS_INVALID", "Provide a field-value object of at most 100 fields.");
      node.get("custom_fields")
          .properties()
          .forEach(
              e -> {
                if (!e.getValue().isString())
                  errors.put(
                      e.getKey(), "Provide a text representation of the configured datatype.");
                else custom.put(e.getKey(), e.getValue().asText().trim());
              });
    }
    for (String key : custom.keySet()) {
      Field f =
          config.metadata().fields().stream()
              .filter(x -> x.id().equals(key))
              .findFirst()
              .orElse(null);
      if (f == null || !f.visible()) errors.put(key, "Unknown or retired field.");
      else if (!actor.permitted(f.write_roles())) throw COSError.forbidden();
    }
    for (Field f : config.metadata().fields())
      if (f.visible() && actor.permitted(f.write_roles())) {
        String value = custom.getOrDefault(f.id(), "");
        if (f.required()
            && value.isBlank()
            && !(old != null
                && !custom.containsKey(f.id())
                && employees.values(old.key()).stream().anyMatch(v -> v.id().equals(f.id()))))
          errors.put(f.id(), "This configured field is required.");
        if (value.length() > (f.max_length() == null ? 500 : f.max_length()))
          errors.put(f.id(), "The configured maximum length was exceeded.");
        if (!value.isBlank())
          try {
            if (f.type().equals("date")) {
              if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException();
              LocalDate.parse(value);
            }
            if (f.type().equals("number")) {
              var number = new BigDecimal(value);
              if (number.precision() > 30 || Math.abs(number.scale()) > 10)
                throw new IllegalArgumentException();
            }
          } catch (Exception e) {
            errors.put(f.id(), "The value does not match the configured datatype.");
          }
      }
    if (!errors.isEmpty())
      throw new COSError(422, "VALIDATION_FAILED", "Correct the highlighted fields.", errors);
    Registration p =
        new Registration(
            node.get("employee_name").asText().trim(),
            mode,
            id,
            node.get("father_name").asText().trim(),
            node.get("nationality_id").asText(),
            node.get("national_id_type_id").asText(),
            identifier,
            Map.copyOf(custom));
    if (employees.duplicate(
        actor.scope(), id, fingerprint(actor.scope(), p), old == null ? null : old.key()))
      throw COSError.conflict(
          "EMP_IDENTITY_ALREADY_EXISTS",
          "An employee ID or composite identity already exists in this scope.");
    return p;
  }

  public void requireObject(JsonNode value, Set<String> allowed) {
    if (value == null || !value.isObject())
      throw new COSError(400, "PAYLOAD_INVALID", "Provide an object payload.");
    value
        .properties()
        .forEach(
            e -> {
              if (!allowed.contains(e.getKey()))
                throw new COSError(
                    400, "UNKNOWN_FIELD", "The payload contains an unknown property.");
            });
  }

  public ObjectNode clean(Registration p) {
    var node = (ObjectNode) json.tree(p);
    if (p.empid_entry_mode().equals("AUTO")) node.remove("sys_emp_id");
    return node;
  }

  public String fingerprint(String scope, Registration p) {
    return crypto.fingerprint(
        scope, p.father_name(), p.nationality_id(), p.national_id_type_id(), p.id_number());
  }

  public UUID apply(
      Registration p,
      COSMetadataRepository.Config config,
      COSActor actor,
      COSEmployeeRepository.Employee old) {
    UUID key = old == null ? UUID.randomUUID() : old.key();
    String id =
        old == null
            ? (p.empid_entry_mode().equals("AUTO")
                ? properties.getIdPrefix()
                    + String.format(Locale.ROOT, "%08d", metadata.allocate(actor.scope()))
                : p.sys_emp_id())
            : old.id();
    String cipher = crypto.encrypt(p.id_number(), actor.scope() + "/identity/" + key);
    if (old == null)
      employees.insert(key, actor.scope(), id, p, cipher, fingerprint(actor.scope(), p));
    else employees.update(old, p, cipher, fingerprint(actor.scope(), p));
    employees.saveValues(
        key,
        config.id(),
        config.metadata().fields(),
        p.custom_fields(),
        (value, field) -> crypto.encrypt(value, actor.scope() + "/field/" + key + "/" + field));
    return key;
  }

  public COSEmployeeRepository.Employee current(UUID key, String scope) {
    return employees.get(key, scope);
  }

  @Transactional(readOnly = true)
  public Page<EmployeeView> list(COSActor actor, String search, UUID after, int limit) {
    requireRead(actor);
    if (search.length() > 120)
      throw new COSError(400, "SEARCH_TOO_LONG", "Use a search of at most 120 characters.");
    int size = Math.clamp(limit, 1, 100);
    var rows = employees.list(actor.scope(), search, after, size + 1);
    return new Page<>(
        rows.stream().limit(size).map(e -> view(e, actor, false)).toList(),
        rows.size() > size ? rows.get(size - 1).key().toString() : null);
  }

  @Transactional
  public EmployeeView details(COSActor actor, UUID key, boolean print) {
    requireRead(actor);
    if (print && !actor.admin() && !actor.roles().contains("REGISTRAR")) throw COSError.forbidden();
    var employee = employees.get(key, actor.scope());
    audit.record(
        actor.scope(),
        actor.id(),
        null,
        print ? "PRINT_EMP_DETAILS" : "READ_EMP_DETAILS",
        key.toString(),
        "PERMITTED");
    return view(employee, actor, print);
  }

  private void requireRead(COSActor actor) {
    if (Collections.disjoint(actor.roles(), Set.of("ADMIN", "REGISTRAR", "VIEWER")))
      throw COSError.forbidden();
  }

  private EmployeeView view(COSEmployeeRepository.Employee e, COSActor actor, boolean print) {
    var fields = metadata.active(actor.scope()).metadata().fields();
    var values = new LinkedHashMap<String, String>();
    for (var value : employees.values(e.key())) {
      Field f = fields.stream().filter(x -> x.id().equals(value.id())).findFirst().orElse(null);
      if (f == null
          || !f.visible()
          || !actor.permitted(f.read_roles())
          || (print && !f.printable())) continue;
      String raw =
          value.ciphertext() == null
              ? value.text()
              : crypto.decrypt(
                  value.ciphertext(), actor.scope() + "/field/" + e.key() + "/" + value.id());
      values.put(value.id(), f.sensitive() ? crypto.mask(raw) : raw);
    }
    return new EmployeeView(
        e.key().toString(),
        e.id(),
        e.name(),
        e.father(),
        e.nationality(),
        e.idType(),
        crypto.mask(crypto.decrypt(e.ciphertext(), actor.scope() + "/identity/" + e.key())),
        Map.copyOf(values),
        e.version(),
        e.created().toString(),
        e.id() + " / " + e.name());
  }

  public JsonNode redact(JsonNode node, COSActor actor) {
    var copy = (ObjectNode) node.deepCopy();
    copy.put("id_number", crypto.mask(node.path("id_number").asText()));
    var values = new LinkedHashMap<String, String>();
    for (Field f : metadata.active(actor.scope()).metadata().fields())
      if (f.visible()
          && actor.permitted(f.read_roles())
          && node.path("custom_fields").has(f.id())) {
        String value = node.get("custom_fields").get(f.id()).asText();
        values.put(f.id(), f.sensitive() ? crypto.mask(value) : value);
      }
    copy.set("custom_fields", json.tree(values));
    return copy;
  }
}
