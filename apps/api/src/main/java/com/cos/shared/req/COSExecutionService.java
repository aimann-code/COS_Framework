package com.cos.shared.req;

import com.cos.hrms.emp.COSEmployeeService;
import com.cos.shared.*;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.metadata.COSMetadataService;
import com.cos.shared.security.COSActor;
import com.cos.shared.web.COSContracts.*;
import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
public class COSExecutionService {
  private final COSRequestRepository requests;
  private final COSMetadataRepository configs;
  private final COSMetadataService metadata;
  private final COSEmployeeService employees;
  private final COSCrypto crypto;
  private final COSJson json;
  private final COSAuditService audit;
  private final ObjectProvider<UserDetailsService> localUsers;

  public COSExecutionService(
      COSRequestRepository requests,
      COSMetadataRepository configs,
      COSMetadataService metadata,
      COSEmployeeService employees,
      COSCrypto crypto,
      COSJson json,
      COSAuditService audit,
      ObjectProvider<UserDetailsService> localUsers) {
    this.requests = requests;
    this.configs = configs;
    this.metadata = metadata;
    this.employees = employees;
    this.crypto = crypto;
    this.json = json;
    this.audit = audit;
    this.localUsers = localUsers;
  }

  private COSActor reauthorize(String id, String scope, String required) {
    var users = localUsers.getIfAvailable();
    if (users == null)
      throw new COSError(
          503,
          "AUTHORITY_RECHECK_UNAVAILABLE",
          "Configure an authoritative principal lookup before enabling production execution.");
    var user = users.loadUserByUsername(id);
    if (!user.isEnabled() || !user.isAccountNonLocked()) throw COSError.forbidden();
    var actor =
        new COSActor(
            id,
            scope,
            user.getAuthorities().stream()
                .map(a -> a.getAuthority().replaceFirst("^ROLE_", ""))
                .collect(java.util.stream.Collectors.toSet()));
    if (required.equals("CONFIG_AUTHOR")) {
      if (!actor.admin()) actor.require("REGISTRAR");
    } else actor.require(required);
    return actor;
  }

  @Transactional
  public void execute(UUID id, String scope) {
    configs.lock(scope);
    var request = requests.get(id, scope, true);
    if (!request.status().equals("APPROVED")) return;
    if (request.actor().equals(request.approver()) || request.approver() == null)
      throw new COSError(403, "APPROVAL_INVALID", "A separate authorized approval is required.");
    reauthorize(request.approver(), scope, "ADMIN");
    var actor =
        reauthorize(
            request.actor(),
            scope,
            request.operation().equals("CONFIGURATION") ? "CONFIG_AUTHOR" : "REGISTRAR");
    var original = configs.config(request.config(), scope);
    var config = metadata.current(scope, original.metadata().version());
    JsonNode payload =
        json.read(crypto.decrypt(request.encrypted(), scope + "/request/" + id), JsonNode.class);
    requests.status(id, "EXECUTING", null, null, null, true);
    var accepted = new ArrayList<String>();
    switch (request.operation()) {
      case "CONFIGURATION" -> {
        Metadata next = json.convert(payload, Metadata.class);
        configs.publish(scope, next, request.approver());
      }
      case "REGISTER" -> {
        var p = employees.validate(payload, config, actor, null);
        UUID key = employees.apply(p, config, actor, null);
        accepted.add(key.toString());
        requests.item(id, 1, key, "COMPLETED", null);
      }
      case "UPDATE" -> {
        UUID key = COSRequestService.uuid(payload.path("employee_key").asText());
        var old = employees.current(key, scope);
        if (old.version() != request.expectedVersion())
          throw COSError.conflict(
              "RECORD_VERSION_CONFLICT", "The employee changed after submission.");
        var p = employees.validate(payload.get("employee"), config, actor, old);
        employees.apply(p, config, actor, old);
        accepted.add(key.toString());
        requests.item(id, 1, key, "COMPLETED", null);
      }
      case "BULK_REGISTER" -> {
        int ordinal = 2;
        for (JsonNode row : payload.path("rows")) {
          var p = employees.validate(row, config, actor, null);
          UUID key = employees.apply(p, config, actor, null);
          accepted.add(key.toString());
          requests.item(id, ordinal++, key, "COMPLETED", null);
        }
      }
      default ->
          throw new COSError(
              422, "OPERATION_NOT_REGISTERED", "This operation has no execution handler.");
    }
    requests.result(
        request,
        Map.of(
            "employee_keys",
            accepted,
            "operation",
            request.operation(),
            "configuration_version",
            request.operation().equals("CONFIGURATION")
                ? config.metadata().version() + 1
                : config.metadata().version()));
    audit.record(scope, request.approver(), id, "EXECUTE_REQUEST", id.toString(), "COMPLETED");
    requests.status(id, "COMPLETED", null, null, null, false);
  }

  @Transactional
  public void failed(UUID id, String scope, String code) {
    configs.lock(scope);
    var r = requests.get(id, scope, true);
    if (!r.status().equals("APPROVED")) return;
    requests.status(id, "FAILED", null, null, code, true);
    if (r.operation().equals("BULK_REGISTER"))
      for (var item : requests.items(id))
        requests.item(id, (Integer) item.get("source_row"), null, "FAILED", code);
    audit.record(scope, "execution-worker", id, "EXECUTE_REQUEST", id.toString(), "FAILED");
  }
}
