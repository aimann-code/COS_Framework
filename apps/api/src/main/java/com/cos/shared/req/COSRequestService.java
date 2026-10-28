package com.cos.shared.req;

import com.cos.hrms.emp.COSEmployeeService;
import com.cos.shared.*;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.metadata.COSMetadataService;
import com.cos.shared.security.COSActor;
import com.cos.shared.web.COSContracts.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service
public class COSRequestService {
  private final COSRequestRepository repository;
  private final COSMetadataRepository configs;
  private final COSMetadataService metadata;
  private final COSEmployeeService employees;
  private final COSCrypto crypto;
  private final COSJson json;
  private final COSAuditService audit;

  public COSRequestService(
      COSRequestRepository repository,
      COSMetadataRepository configs,
      COSMetadataService metadata,
      COSEmployeeService employees,
      COSCrypto crypto,
      COSJson json,
      COSAuditService audit) {
    this.repository = repository;
    this.configs = configs;
    this.metadata = metadata;
    this.employees = employees;
    this.crypto = crypto;
    this.json = json;
    this.audit = audit;
  }

  @Transactional
  public RequestView submit(COSActor actor, CommonRequest dto, String key) {
    if (!dto.component_id().equals("EMP_Reg")
        || !Set.of("REGISTER", "UPDATE", "CONFIGURATION", "BULK_REGISTER")
            .contains(dto.operation()))
      throw new COSError(
          422, "OPERATION_NOT_REGISTERED", "Choose a registered component and operation.");
    if (dto.operation().equals("CONFIGURATION")) {
      if (!actor.admin()) actor.require("REGISTRAR");
    } else actor.require("REGISTRAR");
    if (key == null || !key.matches("[A-Za-z0-9_-]{8,128}"))
      throw new COSError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Provide an Idempotency-Key of 8 to 128 safe characters.");
    configs.lock(actor.scope());
    String hash = crypto.keyedHash(json.canonical(json.tree(dto)));
    var replay = repository.replay(actor.scope(), actor.id(), key);
    if (replay.isPresent()) {
      if (!replay.get().hash().equals(hash))
        throw COSError.conflict(
            "IDEMPOTENCY_CONFLICT", "This key was already used for different request content.");
      return view(replay.get(), actor);
    }
    var config = metadata.current(actor.scope(), dto.configuration_version());
    JsonNode payload = dto.payload();
    UUID employee = null, preview_id = null;
    Integer expected = null;
    switch (dto.operation()) {
      case "REGISTER" ->
          payload = employees.clean(employees.validate(payload, config, actor, null));
      case "UPDATE" -> {
        employees.requireObject(payload, Set.of("employee_key", "record_version", "employee"));
        employee = uuid(payload.path("employee_key").asText());
        expected = payload.path("record_version").asInt(0);
        var old = employees.current(employee, actor.scope());
        if (expected != old.version())
          throw COSError.conflict(
              "RECORD_VERSION_CONFLICT", "Fetch the current employee version before submitting.");
        payload =
            json.tree(
                Map.of(
                    "employee_key",
                    employee.toString(),
                    "record_version",
                    expected,
                    "employee",
                    employees.clean(
                        employees.validate(payload.get("employee"), config, actor, old))));
      }
      case "CONFIGURATION" ->
          payload = json.tree(metadata.validateChange(payload, config.metadata(), actor.scope()));
      case "BULK_REGISTER" -> {
        employees.requireObject(payload, Set.of("preview_id", "source_version"));
        preview_id = uuid(payload.path("preview_id").asText());
        var preview = repository.preview(preview_id, actor.scope());
        if (!preview.actor().equals(actor.id())) throw COSError.forbidden();
        if (preview.expires().isBefore(Instant.now())
            || !preview.config().equals(config.id())
            || !preview.sourceHash().equals(payload.path("source_version").asText()))
          throw COSError.conflict(
              "PREVIEW_STALE", "Create a fresh preview for the current source and configuration.");
        if (repository.previewUsed(preview_id))
          throw COSError.conflict(
              "PREVIEW_ALREADY_SUBMITTED", "This preview already belongs to a submitted request.");
        payload =
            json.tree(
                Map.of(
                    "preview_id",
                    preview.id().toString(),
                    "source_version",
                    preview.sourceHash(),
                    "snapshot_hash",
                    preview.snapshotHash(),
                    "mapping_version",
                    preview.mappingVersion(),
                    "source_name",
                    preview.name(),
                    "row_count",
                    preview.count(),
                    "rows",
                    json.read(
                        crypto.decrypt(
                            preview.encrypted(), actor.scope() + "/preview/" + preview.id()),
                        JsonNode.class)));
      }
    }
    UUID id = UUID.randomUUID();
    var r =
        new COSRequestRepository.Request(
            id,
            "LOCAL-REQ-" + id,
            actor.scope(),
            actor.id(),
            dto.operation(),
            config.id(),
            1,
            hash,
            crypto.encrypt(json.write(payload), actor.scope() + "/request/" + id),
            "PENDING_APPROVAL",
            employee,
            expected,
            preview_id,
            Instant.now(),
            null,
            null,
            null,
            0);
    repository.insert(r, key);
    if (dto.operation().equals("BULK_REGISTER"))
      for (int i = 0; i < payload.path("row_count").asInt(); i++)
        repository.item(id, i + 2, null, "PENDING_APPROVAL", null);
    audit.record(
        actor.scope(), actor.id(), id, "SUBMIT_REQUEST", id.toString(), "PENDING_APPROVAL");
    return view(repository.get(id, actor.scope(), false), actor);
  }

  @Transactional(readOnly = true)
  public Page<RequestView> configurationRequests(COSActor actor, UUID after, int limit) {
    int size = Math.clamp(limit, 1, 100);
    var rows =
        repository.listConfiguration(actor.scope(), actor.id(), actor.admin(), after, size + 1);
    return new Page<>(
        rows.stream().limit(size).map(r -> view(r, actor)).toList(),
        rows.size() > size ? rows.get(size - 1).id().toString() : null);
  }

  @Transactional(readOnly = true)
  public Page<RequestView> list(COSActor actor, UUID after, int limit) {
    int size = Math.clamp(limit, 1, 100);
    var rows = repository.list(actor.scope(), actor.id(), actor.admin(), after, size + 1);
    return new Page<>(
        rows.stream().limit(size).map(r -> view(r, actor)).toList(),
        rows.size() > size ? rows.get(size - 1).id().toString() : null);
  }

  @Transactional(readOnly = true)
  public RequestView get(COSActor actor, UUID id) {
    var r = repository.get(id, actor.scope(), false);
    authorizeRead(r, actor);
    return view(r, actor);
  }

  @Transactional
  public RequestView decide(COSActor actor, UUID id, Approval decision) {
    actor.require("ADMIN");
    configs.lock(actor.scope());
    var r = repository.get(id, actor.scope(), true);
    if (r.actor().equals(actor.id()))
      throw new COSError(
          403, "SELF_APPROVAL_FORBIDDEN", "A different administrator must review this request.");
    if (r.version() != decision.request_version())
      throw COSError.conflict(
          "REQUEST_VERSION_CONFLICT", "Review the exact current request version.");
    if (!Set.of("APPROVE", "REJECT").contains(decision.decision()))
      throw new COSError(422, "DECISION_INVALID", "Choose APPROVE or REJECT.");
    String remarks = decision.remarks() == null ? "" : decision.remarks().trim();
    if (decision.decision().equals("REJECT") && remarks.isBlank())
      throw new COSError(422, "REMARKS_REQUIRED", "Provide a reason for rejection.");
    String target = decision.decision().equals("APPROVE") ? "APPROVED" : "REJECTED";
    if (!r.status().equals("PENDING_APPROVAL")) {
      if ((r.status().equals(target) || r.status().equals("COMPLETED") && target.equals("APPROVED"))
          && actor.id().equals(r.approver())) return view(r, actor);
      throw COSError.conflict(
          "REQUEST_STATE_CONFLICT", "The request already has a decision or is executing.");
    }
    if (target.equals("APPROVED"))
      metadata.current(
          actor.scope(), configs.config(r.config(), actor.scope()).metadata().version());
    repository.approval(r, actor.id(), decision.decision(), remarks);
    repository.status(id, target, actor.id(), remarks, null, false);
    audit.record(actor.scope(), actor.id(), id, "REVIEW_REQUEST", id.toString(), target);
    return view(repository.get(id, actor.scope(), false), actor);
  }

  @Transactional
  public RequestView retry(COSActor actor, UUID id, int version) {
    actor.require("ADMIN");
    configs.lock(actor.scope());
    var r = repository.get(id, actor.scope(), true);
    if (r.actor().equals(actor.id())) throw COSError.forbidden();
    if (!r.status().equals("FAILED") || r.version() != version)
      throw COSError.conflict(
          "RETRY_STATE_CONFLICT", "Only a failed request at its current version may be retried.");
    metadata.current(actor.scope(), configs.config(r.config(), actor.scope()).metadata().version());
    repository.status(id, "APPROVED", null, null, null, false);
    audit.record(actor.scope(), actor.id(), id, "RETRY_REQUEST", id.toString(), "APPROVED");
    return view(repository.get(id, actor.scope(), false), actor);
  }

  private void authorizeRead(COSRequestRepository.Request r, COSActor actor) {
    if (!actor.admin() && !r.actor().equals(actor.id())) throw COSError.forbidden();
  }

  public RequestView view(COSRequestRepository.Request r, COSActor actor) {
    authorizeRead(r, actor);
    var config = configs.config(r.config(), actor.scope());
    JsonNode payload =
        json.read(crypto.decrypt(r.encrypted(), r.scope() + "/request/" + r.id()), JsonNode.class);
    if (r.operation().equals("REGISTER")) payload = employees.redact(payload, actor);
    if (r.operation().equals("UPDATE")) {
      var copy = (ObjectNode) payload.deepCopy();
      copy.set("employee", employees.redact(payload.get("employee"), actor));
      payload = copy;
    }
    if (r.operation().equals("BULK_REGISTER")) {
      var copy = (ObjectNode) payload.deepCopy();
      copy.remove("rows");
      payload = copy;
    }
    return new RequestView(
        r.id().toString(),
        r.readable(),
        r.operation(),
        config.metadata().version(),
        r.version(),
        r.status(),
        r.actor(),
        r.submitted().toString(),
        payload,
        r.employee() == null ? null : r.employee().toString(),
        r.expectedVersion(),
        config.metadata().fields(),
        r.remarks(),
        r.failure(),
        repository.items(r.id()),
        repository.result(r.id()).map(v -> json.read(v, JsonNode.class)).orElse(null));
  }

  public static UUID uuid(String value) {
    try {
      return UUID.fromString(value);
    } catch (Exception e) {
      throw new COSError(400, "IDENTIFIER_INVALID", "Provide a valid UUID reference.");
    }
  }
}
