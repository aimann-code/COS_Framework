package com.cos.shared.metadata;

import com.cos.shared.COSError;
import com.cos.shared.COSJson;
import com.cos.shared.security.COSActor;
import com.cos.shared.web.COSContracts.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
public class COSMetadataService {
  static final Set<String> PROFILE_SECTIONS =
      Set.of(
          "basic",
          "employment",
          "salary",
          "banking",
          "compliance",
          "addresses",
          "contacts",
          "family",
          "education",
          "uniform",
          "additional",
          "company");

  private final COSMetadataRepository repository;
  private final COSJson json;

  public COSMetadataService(COSMetadataRepository repository, COSJson json) {
    this.repository = repository;
    this.json = json;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> configuration(COSActor actor) {
    Metadata m = repository.active(actor.scope()).metadata();
    var permitted =
        m.fields().stream()
            .filter(
                f ->
                    actor.admin()
                        || actor.permitted(f.read_roles())
                        || actor.permitted(f.write_roles()))
            .toList();
    var body = new LinkedHashMap<String, Object>();
    body.put("component_id", "EMP_Reg");
    body.put("version", m.version());
    body.put("fields", permitted);
    body.put("allowed_modes", m.allowed_modes());
    body.put("default_mode", m.default_mode());
    body.put("controlled_values", repository.choices(actor.scope()));
    body.put("bulk_upload_enabled", actor.roles().contains("REGISTRAR"));
    body.put("sheet_sync_enabled", false);
    body.put("max_batch_rows", 500);
    body.put("batch_acceptance_policy", "ALL_OR_NOTHING");
    body.put(
        "placement",
        Map.of(
            "company_id",
            actor.scope(),
            "company",
            repository.scopeLabel(actor.scope()),
            "suite",
            "Enterprise Management",
            "engine",
            "HRMS",
            "module",
            "Employee Management",
            "component_id",
            "EMP_Reg",
            "component",
            "Employee registration"));
    return body;
  }

  public COSMetadataRepository.Config current(String scope, int version) {
    var c = repository.active(scope);
    if (c.metadata().version() != version)
      throw COSError.conflict(
          "CONFIG_VERSION_CONFLICT", "Configuration changed. Refresh, validate and resubmit.");
    return c;
  }

  public Metadata validateChange(JsonNode payload, Metadata current, String scope) {
    if (payload == null || !payload.isObject())
      throw new COSError(422, "CONFIGURATION_INVALID", "Provide a configuration object.");
    payload
        .properties()
        .forEach(
            e -> {
              if (!Set.of("fields", "allowed_modes", "default_mode").contains(e.getKey()))
                throw new COSError(400, "UNKNOWN_FIELD", "Unknown configuration property.");
            });
    if (!payload.path("fields").isArray() || payload.path("fields").size() > 100)
      throw new COSError(422, "CONFIGURATION_INVALID", "Provide at most 100 field definitions.");
    var fields = new ArrayList<Field>();
    var seen = new HashSet<String>();
    for (JsonNode node : payload.get("fields")) {
      if (!node.isObject())
        throw new COSError(422, "FIELD_DEFINITION_INVALID", "Provide field definition objects.");
      Field f;
      try {
        f = json.convert(node, Field.class);
      } catch (RuntimeException e) {
        throw new COSError(
            422, "FIELD_DEFINITION_INVALID", "Use supported field properties and datatypes.");
      }
      if (f.id() == null
          || !f.id().matches("[a-z][a-z0-9_]{0,59}")
          || !seen.add(f.id())
          || Set.of(
                  "sys_emp_id",
                  "employee_name",
                  "father_name",
                  "nationality_id",
                  "national_id_type_id",
                  "id_number",
                  "empid_entry_mode")
              .contains(f.id()))
        throw new COSError(422, "FIELD_ID_INVALID", "Use unique non-core technical field names.");
      if (f.label() == null
          || f.label().isBlank()
          || f.label().length() > 80
          || f.type() == null
          || !List.of("text", "date", "number").contains(f.type()))
        throw new COSError(
            422, "FIELD_DEFINITION_INVALID", "Field label or supported datatype is invalid.");
      Field old =
          current.fields().stream().filter(x -> x.id().equals(f.id())).findFirst().orElse(null);
      if (old != null && !old.type().equals(f.type()))
        throw COSError.conflict(
            "FIELD_TYPE_IMMUTABLE", "Existing field types require an explicit migration.");
      if ((f.id().equals("pan_number") || f.id().equals("aadhaar_number")) && !f.sensitive())
        throw new COSError(
            422, "SENSITIVITY_REQUIRED", "Restricted identifier fields must remain sensitive.");
      var reads = f.read_roles() == null ? List.of("ADMIN", "REGISTRAR", "VIEWER") : f.read_roles();
      var writes = f.write_roles() == null ? List.of("REGISTRAR") : f.write_roles();
      if (reads.stream().anyMatch(Objects::isNull)
          || writes.stream().anyMatch(Objects::isNull)
          || !Set.of("ADMIN", "REGISTRAR", "VIEWER", "EMPLOYEE").containsAll(reads)
          || !Set.of("ADMIN", "REGISTRAR", "EMPLOYEE").containsAll(writes))
        throw new COSError(422, "POLICY_INVALID", "Use registered field roles.");
      if (f.visible() && f.required() && !writes.contains("REGISTRAR"))
        throw new COSError(
            422, "POLICY_INVALID", "A required registration field must permit registrar writes.");
      UUID field_id =
          old == null
              ? UUID.nameUUIDFromBytes(
                  (scope + ":" + f.id()).getBytes(java.nio.charset.StandardCharsets.UTF_8))
              : UUID.fromString(old.field_id());
      String section =
          f.group_key() == null || f.group_key().isBlank() ? "additional" : f.group_key();
      if (!PROFILE_SECTIONS.contains(section))
        throw new COSError(
            422,
            "FIELD_SECTION_INVALID",
            "Choose a profile section such as basic details or compliance.");
      fields.add(
          new Field(
              f.id(),
              field_id.toString(),
              f.label().trim(),
              f.type(),
              f.required(),
              f.visible(),
              f.sensitive(),
              List.copyOf(reads),
              List.copyOf(writes),
              f.printable(),
              f.display_order(),
              section,
              f.max_length() == null ? 500 : Math.clamp(f.max_length(), 1, 2048)));
    }
    // Retiring means setting visible=false, so historical field definitions and references survive.
    if (current.fields().stream().anyMatch(f -> !seen.contains(f.id())))
      throw new COSError(
          422,
          "FIELD_RETIREMENT_REQUIRED",
          "Keep existing fields and disable them instead of deleting their definitions.");
    var modes = new ArrayList<String>();
    if (payload.has("allowed_modes")) {
      if (!payload.get("allowed_modes").isArray() || payload.get("allowed_modes").size() > 2)
        throw new COSError(422, "ID_MODES_INVALID", "Provide an array of Manual and Auto modes.");
      payload
          .get("allowed_modes")
          .forEach(
              n -> {
                if (!n.isString())
                  throw new COSError(422, "ID_MODES_INVALID", "Use text mode names.");
                modes.add(n.asText());
              });
    } else modes.addAll(current.allowed_modes());
    if (payload.has("default_mode") && !payload.get("default_mode").isString())
      throw new COSError(422, "ID_MODES_INVALID", "The default mode must be text.");
    String defaultMode =
        payload.has("default_mode") ? payload.get("default_mode").asText() : current.default_mode();
    if (new HashSet<>(modes).size() != modes.size()
        || modes.isEmpty()
        || !Set.of("MANUAL", "AUTO").containsAll(modes)
        || (!defaultMode.isEmpty() && !modes.contains(defaultMode)))
      throw new COSError(
          422,
          "ID_MODES_INVALID",
          "Only Manual and Auto are supported; the default must be an allowed mode or empty.");
    return new Metadata(
        current.version() + 1, List.copyOf(fields), List.copyOf(modes), defaultMode);
  }

  @Transactional
  public void seedLocal(String scope) {
    if (repository.scopeExists(scope)) return;
    repository.createScope(scope);
    repository.lock(scope);
    for (String nationality : List.of("India", "United Kingdom", "United States", "Other"))
      repository.addChoice(scope, "NATIONALITY", nationality, nationality);
    for (String type : List.of("Passport", "National identity card", "Other approved document"))
      repository.addChoice(scope, "ID_TYPE", type, type);
    List<Field> fields = new ArrayList<>();
    int order = 0;
    for (String id : List.of("dob", "pan_number", "aadhaar_number"))
      fields.add(
          new Field(
              id,
              UUID.nameUUIDFromBytes(
                      (scope + ":" + id).getBytes(java.nio.charset.StandardCharsets.UTF_8))
                  .toString(),
              id.equals("dob")
                  ? "Date of birth"
                  : id.equals("pan_number") ? "PAN number" : "Aadhaar number",
              id.equals("dob") ? "date" : "text",
              false,
              id.equals("dob"),
              !id.equals("dob"),
              id.equals("dob")
                  ? List.of("REGISTRAR", "ADMIN", "VIEWER")
                  : List.of("REGISTRAR", "ADMIN"),
              List.of("REGISTRAR"),
              id.equals("dob"),
              order++,
              "additional",
              500));
    repository.publish(
        scope, new Metadata(1, fields, List.of("MANUAL", "AUTO"), ""), "local-bootstrap");
  }
}
