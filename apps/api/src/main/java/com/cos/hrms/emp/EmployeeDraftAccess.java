package com.cos.hrms.emp;

import static com.cos.hrms.emp.OnboardingContracts.DocumentView;

import com.cos.shared.COSError;
import com.cos.shared.security.COSActor;
import java.util.Set;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;

/** Draft and profile access shared by Employee Registration and Employee Documents. */
@Service
public class EmployeeDraftAccess {
  private final OnboardingRepository repository;
  private final Environment environment;

  public EmployeeDraftAccess(OnboardingRepository repository, Environment environment) {
    this.repository = repository;
    this.environment = environment;
  }

  public boolean hr(COSActor actor) {
    return actor.roles().contains("REGISTRAR");
  }

  public boolean local() {
    return environment.acceptsProfiles(Profiles.of("local", "test"));
  }

  public UUID own(COSActor actor) {
    actor.require("EMPLOYEE");
    return repository
        .membership(actor.scope(), actor.id())
        .orElseThrow(
            () ->
                new COSError(
                    403,
                    "EMPLOYEE_NOT_LINKED",
                    "HR must link your account to an employee record."));
  }

  public void canReadEmployee(COSActor actor, UUID id) {
    if (!hr(actor) && !own(actor).equals(id)) throw COSError.forbidden();
  }

  public void canReadDraft(COSActor actor, OnboardingRepository.Draft draft) {
    if (draft.actor().equals(actor.id()) && (hr(actor) || actor.roles().contains("EMPLOYEE")))
      return;
    if (hr(actor) && !draft.status().equals("DRAFT")) return;
    if (draft.employee() != null && Set.of("REGISTERED", "APPROVED").contains(draft.status())) {
      canReadEmployee(actor, draft.employee());
      return;
    }
    throw COSError.forbidden();
  }

  public void canWriteDraft(COSActor actor, OnboardingRepository.Draft draft) {
    if (!draft.actor().equals(actor.id()) || !draft.status().equals("DRAFT"))
      throw COSError.forbidden();
    if (!hr(actor) && !own(actor).equals(draft.employee())) throw COSError.forbidden();
  }

  public DocumentView documentView(OnboardingRepository.Document d) {
    return new DocumentView(
        d.id().toString(), d.kind(), d.media(), d.bytes(), d.scan(), d.created());
  }
}
