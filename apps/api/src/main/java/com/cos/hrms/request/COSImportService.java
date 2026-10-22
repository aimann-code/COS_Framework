package com.cos.hrms.request;

import com.cos.hrms.employee.COSEmployeeService;
import com.cos.hrms.metadata.COSMetadataRepository;
import com.cos.hrms.metadata.COSMetadataService;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.*;
import com.cos.hrms.web.COSContracts.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
public class COSImportService {
  private final COSRequestRepository repository;
  private final COSMetadataRepository configs;
  private final COSMetadataService metadata;
  private final COSEmployeeService employees;
  private final COSCrypto crypto;
  private final COSJson json;

  public COSImportService(
      COSRequestRepository repository,
      COSMetadataRepository configs,
      COSMetadataService metadata,
      COSEmployeeService employees,
      COSCrypto crypto,
      COSJson json) {
    this.repository = repository;
    this.configs = configs;
    this.metadata = metadata;
    this.employees = employees;
    this.crypto = crypto;
    this.json = json;
  }

  @Transactional
  public PreviewResult preview(COSActor actor, ImportPreview input) {
    actor.require("REGISTRAR");
    configs.lock(actor.scope());
    var config = metadata.current(actor.scope(), input.configuration_version());
    if (!input.source_hash().matches("[a-f0-9]{64}")
        || input.mapping().values().stream().anyMatch(v -> v == null || v.length() > 120))
      throw new COSError(
          422, "SOURCE_INVALID", "Provide a bounded source mapping and SHA-256 source hash.");
    var rows = new ArrayList<PreviewRow>();
    var snapshot = new ArrayList<JsonNode>();
    var ids = new HashSet<String>();
    var fingerprints = new HashSet<String>();
    for (int i = 0; i < input.rows().size(); i++) {
      var node = input.rows().get(i);
      try {
        var p = employees.validate(node, config, actor, null);
        String fingerprint = employees.fingerprint(actor.scope(), p);
        if (!fingerprints.add(fingerprint)
            || (p.sys_emp_id() != null && !ids.add(p.sys_emp_id().toLowerCase(Locale.ROOT))))
          throw COSError.conflict(
              "DUPLICATE_SOURCE_ROW", "Duplicate employee identity or ID in this source.");
        snapshot.add(employees.clean(p));
        JsonNode safe = employees.redact(employees.clean(p), actor);
        rows.add(
            new PreviewRow(
                i + 2,
                Map.of(
                    "employee_name",
                    safe.path("employee_name").asText(),
                    "empid_entry_mode",
                    p.empid_entry_mode(),
                    "sys_emp_id",
                    p.sys_emp_id() == null ? "" : p.sys_emp_id(),
                    "id_number",
                    safe.path("id_number").asText()),
                Map.of()));
      } catch (COSError e) {
        if (e.status == 403) throw e;
        rows.add(
            new PreviewRow(i + 2, Map.of(), e.fields.isEmpty() ? Map.of("row", e.code) : e.fields));
      }
    }
    int errors = (int) rows.stream().filter(r -> !r.errors().isEmpty()).count();
    String snapshotHash = crypto.hash(json.canonical(json.tree(input.rows())));
    String mappingVersion = crypto.hash(json.canonical(json.tree(input.mapping())));
    if (errors > 0)
      return new PreviewResult(
          null,
          input.source_hash(),
          snapshotHash,
          mappingVersion,
          rows.size() - errors,
          errors,
          rows);
    UUID id = UUID.randomUUID();
    repository.savePreview(
        new COSRequestRepository.Preview(
            id,
            actor.scope(),
            actor.id(),
            config.id(),
            input.source_hash(),
            snapshotHash,
            mappingVersion,
            input.source_name(),
            crypto.encrypt(json.write(snapshot), actor.scope() + "/preview/" + id),
            snapshot.size(),
            Instant.now().plus(Duration.ofHours(1))));
    return new PreviewResult(
        id.toString(), input.source_hash(), snapshotHash, mappingVersion, rows.size(), 0, rows);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(COSActor actor, UUID id) {
    var p = repository.preview(id, actor.scope());
    if (!p.actor().equals(actor.id()) && !actor.admin()) throw COSError.forbidden();
    return Map.of(
        "preview_id",
        p.id().toString(),
        "source_version",
        p.sourceHash(),
        "snapshot_hash",
        p.snapshotHash(),
        "mapping_version",
        p.mappingVersion(),
        "row_count",
        p.count(),
        "expires_at",
        p.expires().toString(),
        "configuration_version",
        configs.config(p.config(), actor.scope()).metadata().version());
  }
}
