package com.cos.hrms.emp.reg;

import static com.cos.hrms.emp.OnboardingContracts.*;

import com.cos.hrms.emp.doc.OnboardingDocumentService;
import com.cos.shared.config.COSProperties;
import com.cos.shared.security.COSActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Validated
@RequestMapping("/api/v1/cos/onboarding")
public class OnboardingController {
  private final OnboardingService profiles;
  private final OnboardingDocumentService documents;
  private final COSProperties properties;

  public OnboardingController(
      OnboardingService profiles, OnboardingDocumentService documents, COSProperties properties) {
    this.profiles = profiles;
    this.documents = documents;
    this.properties = properties;
  }

  private COSActor actor(Authentication a) {
    return COSActor.from(a, properties);
  }

  @GetMapping("/schema")
  public Schema schema(Authentication a) {
    return profiles.schema(actor(a));
  }

  @GetMapping("/drafts")
  public List<DraftSummary> drafts(
      Authentication a, @RequestParam(defaultValue = "false") boolean reviews) {
    return profiles.drafts(actor(a), reviews);
  }

  @GetMapping("/requests")
  public List<DraftSummary> ownRequests(Authentication a) {
    return profiles.ownRequests(actor(a));
  }

  @GetMapping("/drafts/{id}")
  public DraftView draft(Authentication a, @PathVariable UUID id) {
    return profiles.getDraft(actor(a), id);
  }

  @PutMapping("/drafts/{id}")
  public DraftView save(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody SaveDraftPayload input) {
    return profiles.savePayload(actor(a), id, input);
  }

  @GetMapping("/drafts/{id}/work-email")
  public WorkEmailPreview workEmail(
      Authentication a,
      @PathVariable UUID id,
      @RequestParam(required = false) String name,
      @RequestParam(required = false) String mode,
      @RequestParam(required = false) String existing) {
    return profiles.previewWorkEmail(actor(a), id, name, mode, existing);
  }

  @PostMapping("/drafts/{id}/register")
  public EmployeeView register(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody Command input) {
    return profiles.register(actor(a), id, input.version());
  }

  @PostMapping("/drafts/{id}/submit")
  public DraftView submit(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody Command input) {
    return profiles.submitUpdate(actor(a), id, input.version());
  }

  @PostMapping("/drafts/{id}/review")
  public DraftView review(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody Decision input) {
    return profiles.review(actor(a), id, input);
  }

  @GetMapping("/employees")
  public com.cos.shared.web.COSContracts.Page<EmployeeSummary> employees(
      Authentication a,
      @RequestParam(defaultValue = "") String search,
      @RequestParam(required = false) UUID after,
      @RequestParam(defaultValue = "50") int limit) {
    return profiles.employees(actor(a), search, after, limit);
  }

  @GetMapping("/employees/{id}")
  public EmployeeView employee(Authentication a, @PathVariable UUID id) {
    return profiles.employee(actor(a), id);
  }

  @PutMapping("/employees/{employee}/drafts/{draft}")
  public DraftView startHREdit(
      Authentication a,
      @PathVariable UUID employee,
      @PathVariable UUID draft,
      @Valid @RequestBody Command input) {
    return profiles.startHREdit(actor(a), employee, draft, input.version());
  }

  @PostMapping("/drafts/{id}/apply")
  public EmployeeView applyHREdit(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody Command input) {
    return profiles.applyHREdit(actor(a), id, input.version());
  }

  @GetMapping("/me")
  public EmployeeView me(Authentication a) {
    return profiles.me(actor(a));
  }

  @PostMapping(value = "/drafts/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public DocumentView upload(
      Authentication a,
      @PathVariable UUID id,
      @RequestParam @Min(1) int version,
      @RequestParam String kind,
      @RequestPart MultipartFile file) {
    return documents.upload(actor(a), id, version, kind, file);
  }

  @DeleteMapping("/documents/{id}")
  public ResponseEntity<Void> remove(
      Authentication a, @PathVariable UUID id, @RequestParam @Min(1) int version) {
    documents.remove(actor(a), id, version);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/documents/{id}/content")
  public ResponseEntity<byte[]> download(Authentication a, @PathVariable UUID id) {
    var file = documents.download(actor(a), id);
    return ResponseEntity.ok()
        .contentType(MediaType.IMAGE_PNG)
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(file.filename()).build().toString())
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .cacheControl(CacheControl.noStore())
        .body(file.content());
  }
}
