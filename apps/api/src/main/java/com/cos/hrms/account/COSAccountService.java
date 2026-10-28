package com.cos.hrms.account;

import com.cos.hrms.config.COSProperties;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.*;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("!oidc")
public class COSAccountService {
  public record Signup(
      @NotBlank @Size(max = 100) String full_name,
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 12, max = 72) String password) {}

  public record Review(@NotBlank String decision, String role, @Size(max = 500) String remarks) {}

  public record AccountView(
      String account_id, String full_name, String email, String status, String created_at) {}

  private final COSAccountRepository accounts;
  private final PasswordEncoder encoder;
  private final COSProperties properties;
  private final COSAuditService audit;

  public COSAccountService(
      COSAccountRepository accounts,
      PasswordEncoder encoder,
      COSProperties properties,
      COSAuditService audit) {
    this.accounts = accounts;
    this.encoder = encoder;
    this.properties = properties;
    this.audit = audit;
  }

  @Transactional
  public void signup(Signup input) {
    if (input.password().getBytes(StandardCharsets.UTF_8).length > 72)
      throw new COSError(
          422,
          "PASSWORD_INVALID",
          "Use a password of 12 or more characters and at most 72 UTF-8 bytes.",
          Map.of("password", "This password is too long."));
    String email = input.email().strip().toLowerCase(Locale.ROOT);
    accounts.create(
        properties.getScopeId(),
        input.full_name().strip(),
        email,
        encoder.encode(input.password()));
    // The public response is identical for existing and new email addresses.
  }

  @Transactional(readOnly = true)
  public List<AccountView> pending(COSActor actor) {
    actor.require("ADMIN");
    return accounts.pending(actor.scope()).stream()
        .map(
            a ->
                new AccountView(
                    a.id().toString(), a.name(), a.email(), a.status(), a.created().toString()))
        .toList();
  }

  @Transactional
  public void review(COSActor actor, UUID id, Review input) {
    actor.require("ADMIN");
    var account = accounts.get(actor.scope(), id).orElseThrow(COSError::missing);
    if (!account.status().equals("PENDING"))
      throw COSError.conflict(
          "ACCOUNT_ALREADY_REVIEWED",
          "This account request has already been reviewed. Refresh the list.");
    if (account.email().equals(actor.id())) throw COSError.forbidden();
    if (!Set.of("APPROVE", "REJECT").contains(input.decision()))
      throw new COSError(422, "DECISION_INVALID", "Choose Approve or Reject.");
    String note = input.remarks() == null ? "" : input.remarks().strip();
    boolean approve = input.decision().equals("APPROVE");
    if (approve
        && !Set.of("VIEWER", "REGISTRAR").contains(input.role() == null ? "" : input.role()))
      throw new COSError(422, "ROLE_INVALID", "Choose Employee viewer or Registration user.");
    if (!approve && note.isBlank())
      throw new COSError(422, "REMARKS_REQUIRED", "A rejection reason is required.");
    accounts.review(
        id, approve ? "ACTIVE" : "REJECTED", approve ? input.role() : null, actor.id(), note);
    audit.record(
        actor.scope(),
        actor.id(),
        null,
        "REVIEW_ACCOUNT",
        id.toString(),
        approve ? "ACTIVE" : "REJECTED");
  }
}
