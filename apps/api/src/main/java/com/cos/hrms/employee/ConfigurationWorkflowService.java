package com.cos.hrms.employee;

import com.cos.hrms.request.COSRequestService;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.COSError;
import com.cos.hrms.web.COSContracts.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConfigurationWorkflowService {
  private final COSRequestService requests;

  public ConfigurationWorkflowService(COSRequestService requests) {
    this.requests = requests;
  }

  @Transactional
  public RequestView submit(COSActor actor, CommonRequest input, String key) {
    actor.require("REGISTRAR");
    if (!input.operation().equals("CONFIGURATION")) throw retired();
    return requests.submit(actor, input, key);
  }

  @Transactional(readOnly = true)
  public Page<RequestView> list(COSActor actor, UUID after, int limit) {
    if (!actor.admin()) actor.require("REGISTRAR");
    return requests.configurationRequests(actor, after, limit);
  }

  @Transactional(readOnly = true)
  public RequestView get(COSActor actor, UUID id) {
    var request = requests.get(actor, id);
    if (!request.operation().equals("CONFIGURATION")) throw retired();
    return request;
  }

  @Transactional
  public RequestView decide(COSActor actor, UUID id, Approval decision) {
    actor.require("ADMIN");
    get(actor, id);
    return requests.decide(actor, id, decision);
  }

  @Transactional
  public RequestView retry(COSActor actor, UUID id, int version) {
    actor.require("ADMIN");
    get(actor, id);
    return requests.retry(actor, id, version);
  }

  public static COSError retired() {
    return new COSError(
        410,
        "LEGACY_WORKFLOW_RETIRED",
        "Use Employee Management onboarding. HR registration no longer requires administrator"
            + " approval.");
  }
}
