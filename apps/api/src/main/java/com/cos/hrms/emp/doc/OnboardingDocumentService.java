package com.cos.hrms.emp.doc;

import static com.cos.hrms.emp.OnboardingContracts.*;

import com.cos.hrms.emp.EmployeeDraftAccess;
import com.cos.hrms.emp.OnboardingRepository;
import com.cos.shared.*;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.security.COSActor;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OnboardingDocumentService {
  public record Download(byte[] content, String filename) {}

  private final OnboardingRepository repository;
  private final EmployeeDraftAccess access;
  private final COSMetadataRepository configs;
  private final OnboardingImagePolicy images;
  private final COSCrypto crypto;
  private final COSAuditService audit;

  public OnboardingDocumentService(
      OnboardingRepository repository,
      EmployeeDraftAccess access,
      COSMetadataRepository configs,
      OnboardingImagePolicy images,
      COSCrypto crypto,
      COSAuditService audit) {
    this.repository = repository;
    this.access = access;
    this.configs = configs;
    this.images = images;
    this.crypto = crypto;
    this.audit = audit;
  }

  @Transactional
  public DocumentView upload(
      COSActor actor, UUID draft, int version, String kind, MultipartFile file) {
    if (!Set.of("AADHAAR_FRONT", "AADHAAR_BACK", "PAN").contains(kind))
      throw new COSError(422, "DOCUMENT_KIND_INVALID", "Choose Aadhaar front/back or PAN.");
    configs.lock(actor.scope());
    var d = repository.draft(actor.scope(), draft);
    access.canWriteDraft(actor, d);
    if (d.version() != version)
      throw COSError.conflict("DRAFT_VERSION_CONFLICT", "Reload the draft before uploading.");
    if (repository.documentCount(actor.scope(), actor.id()) >= 30)
      throw new COSError(
          429, "DOCUMENT_UPLOAD_LIMIT", "The daily document upload limit was reached.");
    var validated = images.validate(file, access.local());
    for (var old : repository.documents(actor.scope(), draft))
      if (old.kind().equals(kind)) repository.removeDocument(actor.scope(), old.id());
    UUID id = UUID.randomUUID();
    String encoded = Base64.getEncoder().encodeToString(validated.bytes());
    repository.addDocument(
        id,
        actor.scope(),
        draft,
        kind,
        crypto.encrypt(encoded, context(actor.scope(), id)),
        "image/png",
        validated.bytes().length,
        crypto.hash(encoded),
        validated.scan(),
        actor.id());
    audit.record(
        actor.scope(),
        actor.id(),
        null,
        "UPLOAD_EMPLOYEE_DOCUMENT",
        id.toString(),
        validated.scan());
    repository.saveDraft(d, d.encrypted(), d.config());
    return access.documentView(repository.document(actor.scope(), id));
  }

  @Transactional
  public void remove(COSActor actor, UUID id, int version) {
    configs.lock(actor.scope());
    var doc = repository.document(actor.scope(), id);
    var draft = repository.draft(actor.scope(), doc.draft());
    access.canWriteDraft(actor, draft);
    if (draft.version() != version)
      throw COSError.conflict(
          "DRAFT_VERSION_CONFLICT", "Reload the draft before removing a photo.");
    repository.removeDocument(actor.scope(), id);
    repository.saveDraft(draft, draft.encrypted(), draft.config());
    audit.record(
        actor.scope(), actor.id(), null, "REMOVE_EMPLOYEE_DOCUMENT", id.toString(), "REMOVED");
  }

  @Transactional
  public Download download(COSActor actor, UUID id) {
    configs.lock(actor.scope());
    var doc = repository.document(actor.scope(), id);
    var draft = repository.draft(actor.scope(), doc.draft());
    access.canReadDraft(actor, draft);
    audit.record(
        actor.scope(), actor.id(), null, "DOWNLOAD_EMPLOYEE_DOCUMENT", id.toString(), "PERMITTED");
    return new Download(
        Base64.getDecoder().decode(crypto.decrypt(doc.encrypted(), context(actor.scope(), id))),
        doc.kind().toLowerCase(Locale.ROOT) + "-" + id + ".png");
  }

  private String context(String scope, UUID id) {
    return scope + "/onboarding/document/" + id;
  }
}
