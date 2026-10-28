package com.cos.hrms.web;

import com.cos.hrms.config.COSProperties;
import com.cos.hrms.employee.COSEmployeeService;
import com.cos.hrms.metadata.COSFavoriteService;
import com.cos.hrms.metadata.COSMetadataService;
import com.cos.hrms.request.COSImportService;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.COSError;
import com.cos.hrms.web.COSContracts.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cos")
public class COSController {
  private final COSProperties properties;
  private final COSMetadataService metadata;
  private final COSEmployeeService employees;
  private final com.cos.hrms.employee.ConfigurationWorkflowService requests;
  private final COSImportService imports;
  private final COSFavoriteService favorites;

  public COSController(
      COSProperties properties,
      COSMetadataService metadata,
      COSEmployeeService employees,
      com.cos.hrms.employee.ConfigurationWorkflowService requests,
      COSImportService imports,
      COSFavoriteService favorites) {
    this.properties = properties;
    this.metadata = metadata;
    this.employees = employees;
    this.requests = requests;
    this.imports = imports;
    this.favorites = favorites;
  }

  private COSActor actor(Authentication auth) {
    return COSActor.from(auth, properties);
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "UP", "application", "COS_HRMS_EMP_MGT");
  }

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    if (token == null)
      throw new COSError(
          404, "SESSION_LOGIN_UNAVAILABLE", "Use your configured OAuth2 bearer token.");
    return Map.of("header_name", token.getHeaderName(), "token", token.getToken());
  }

  @GetMapping("/session")
  public Map<String, Object> session(Authentication authentication) {
    if (authentication == null) return Map.of("authenticated", false);
    var a = actor(authentication);
    return Map.of(
        "authenticated",
        true,
        "username",
        a.id(),
        "roles",
        a.roles(),
        "scope_id",
        a.scope(),
        "can_print",
        a.admin() || a.roles().contains("REGISTRAR"));
  }

  @GetMapping("/architecture/options")
  public Map<String, Object> options(Authentication a) {
    var actor = actor(a);
    return Map.of(
        "hierarchy",
        List.of("Enterprise Management", "HRMS", "Employee Management"),
        "components",
        favorites.accessible(actor));
  }

  @GetMapping("/components/EMP_Reg/configuration")
  public Map<String, Object> configuration(Authentication a) {
    return metadata.configuration(actor(a));
  }

  @GetMapping("/employees")
  public Page<EmployeeView> employees(
      Authentication a,
      @RequestParam(defaultValue = "") String search,
      @RequestParam(required = false) UUID after,
      @RequestParam(defaultValue = "50") int limit) {
    return employees.list(actor(a), search, after, limit);
  }

  @GetMapping("/employees/{key}")
  public EmployeeView employee(Authentication a, @PathVariable UUID key) {
    return employees.details(actor(a), key, false);
  }

  @PostMapping("/employees/{key}/print")
  public EmployeeView print(Authentication a, @PathVariable UUID key) {
    return employees.details(actor(a), key, true);
  }

  @GetMapping("/requests")
  public Page<RequestView> requests(
      Authentication a,
      @RequestParam(required = false) UUID after,
      @RequestParam(defaultValue = "50") int limit) {
    return requests.list(actor(a), after, limit);
  }

  @PostMapping("/requests")
  public ResponseEntity<RequestView> submit(
      Authentication a,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @Valid @RequestBody CommonRequest dto) {
    return ResponseEntity.accepted().body(requests.submit(actor(a), dto, key));
  }

  @GetMapping("/requests/{id}")
  public RequestView request(Authentication a, @PathVariable UUID id) {
    return requests.get(actor(a), id);
  }

  @PostMapping("/requests/{id}/approvals")
  public RequestView approve(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody Approval input) {
    return requests.decide(actor(a), id, input);
  }

  @PostMapping("/requests/{id}/retry")
  public RequestView retry(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody Retry input) {
    return requests.retry(actor(a), id, input.request_version());
  }

  @PostMapping("/employee-import-previews")
  public PreviewResult preview(Authentication a, @Valid @RequestBody ImportPreview input) {
    return imports.preview(actor(a), input);
  }

  @GetMapping("/import-previews/{id}")
  public Map<String, Object> preview(Authentication a, @PathVariable UUID id) {
    return imports.get(actor(a), id);
  }

  @PostMapping("/employee-sheet-sync-previews")
  public void sheets(Authentication a) {
    actor(a).require("REGISTRAR");
    throw new COSError(
        503,
        "SHEET_SOURCE_NOT_CONFIGURED",
        "Configure an authorized Google source and approved sync policy before previewing.");
  }

  @GetMapping("/me/favorites")
  public List<String> favorites(Authentication a) {
    return favorites.list(actor(a));
  }

  @PutMapping("/me/favorites/{component}")
  public ResponseEntity<Void> favorite(Authentication a, @PathVariable String component) {
    favorites.set(actor(a), component, true);
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/me/favorites/{component}")
  public ResponseEntity<Void> unfavorite(Authentication a, @PathVariable String component) {
    favorites.set(actor(a), component, false);
    return ResponseEntity.noContent().build();
  }
}
