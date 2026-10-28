package com.cos.hrms.emp.reg;

import com.cos.hrms.emp.OnboardingRepository;
import com.cos.shared.*;
import com.cos.shared.account.*;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.security.COSActor;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("!oidc")
public class OnboardingAccountService {
  public record Review(
      @NotBlank String decision,
      @Size(max = 80) String employee_code,
      @Size(max = 500) String remarks) {}

  private final COSAccountRepository accounts;
  private final OnboardingRepository profiles;
  private final COSMetadataRepository scopes;
  private final COSAuditService audit;

  public OnboardingAccountService(
      COSAccountRepository accounts,
      OnboardingRepository profiles,
      COSMetadataRepository scopes,
      COSAuditService audit) {
    this.accounts = accounts;
    this.profiles = profiles;
    this.scopes = scopes;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public List<COSAccountService.AccountView> pending(COSActor actor) {
    actor.require("REGISTRAR");
    return accounts.pending(actor.scope()).stream()
        .map(
            a ->
                new COSAccountService.AccountView(
                    a.id().toString(), a.name(), a.email(), a.status(), a.created().toString()))
        .toList();
  }

  @Transactional
  public void review(COSActor actor, UUID id, Review input) {
    actor.require("REGISTRAR");
    scopes.lock(actor.scope());
    var account = accounts.get(actor.scope(), id).orElseThrow(COSError::missing);
    if (!account.status().equals("PENDING"))
      throw COSError.conflict("ACCOUNT_ALREADY_REVIEWED", "This access request already changed.");
    if (account.email().equals(actor.id())) throw COSError.forbidden();
    if (!Set.of("APPROVE", "REJECT").contains(input.decision()))
      throw new COSError(422, "DECISION_INVALID", "Choose APPROVE or REJECT.");
    String note = input.remarks() == null ? "" : input.remarks().strip();
    boolean approve = input.decision().equals("APPROVE");
    if (!approve && note.isBlank())
      throw new COSError(422, "REMARKS_REQUIRED", "Explain why access is rejected.");
    if (approve) {
      if (input.employee_code() == null || input.employee_code().isBlank())
        throw new COSError(
            422,
            "EMPLOYEE_LINK_REQUIRED",
            "Verify and enter the employee code before activating access.");
      var employee =
          profiles
              .byCode(actor.scope(), input.employee_code().strip())
              .orElseThrow(COSError::missing);
      profiles.link(actor.scope(), account.email(), employee.id(), actor.id());
    }
    accounts.review(
        id, approve ? "ACTIVE" : "REJECTED", approve ? "EMPLOYEE" : null, actor.id(), note);
    audit.record(
        actor.scope(),
        actor.id(),
        null,
        "HR_REVIEW_EMPLOYEE_ACCESS",
        id.toString(),
        approve ? "ACTIVE" : "REJECTED");
  }
}
