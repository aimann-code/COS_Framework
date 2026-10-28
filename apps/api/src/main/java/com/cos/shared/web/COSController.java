package com.cos.shared.web;

import com.cos.hrms.emp.COSEmployeeService;
import com.cos.shared.COSError;
import com.cos.shared.config.COSProperties;
import com.cos.shared.metadata.COSFavoriteService;
import com.cos.shared.metadata.COSMetadataService;
import com.cos.shared.req.COSImportService;
import com.cos.shared.security.COSActor;
import com.cos.shared.web.COSContracts.*;
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
  private final com.cos.hrms.emp.ConfigurationWorkflowService requests;
  private final COSImportService imports;
  private final COSFavoriteService favorites;
  private final org.springframework.jdbc.core.simple.JdbcClient jdbc;

  public COSController(
      COSProperties properties,
      COSMetadataService metadata,
      COSEmployeeService employees,
      com.cos.hrms.emp.ConfigurationWorkflowService requests,
      COSImportService imports,
      COSFavoriteService favorites,
      org.springframework.jdbc.core.simple.JdbcClient jdbc) {
    this.properties = properties;
    this.metadata = metadata;
    this.employees = employees;
    this.requests = requests;
    this.imports = imports;
    this.favorites = favorites;
    this.jdbc = jdbc;
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
    boolean platformAdmin = a.admin() && a.scope().equals(properties.getScopeId());
    boolean companyPortal =
        (a.admin() || a.roles().contains("REGISTRAR"))
            && jdbc.sql(
                    "SELECT EXISTS(SELECT 1 FROM commerce.company WHERE scope_id=:scope AND"
                        + " status='ACTIVE')")
                .param("scope", a.scope())
                .query(Boolean.class)
                .single();
    boolean companyManager =
        companyPortal
            && (a.admin()
                || jdbc.sql(
                        "SELECT EXISTS(SELECT 1 FROM commerce.company c JOIN auth.company_request r"
                            + " ON r.request_id=c.company_id WHERE c.scope_id=:scope AND"
                            + " c.status='ACTIVE' AND r.login_email=:email)")
                    .param("scope", a.scope())
                    .param("email", a.id())
                    .query(Boolean.class)
                    .single());
    // Navigation describes the account's workspace; it grants no additional authority.
    String homeWorkspace =
        platformAdmin
            ? "PLATFORM"
            : a.roles().contains("EMPLOYEE")
                ? "EMPLOYEE"
                : companyManager
                    ? "COMPANY"
                    : a.roles().contains("REGISTRAR")
                        ? "HR"
                        : a.admin() ? "CONFIGURATION" : "DIRECTORY";
    return Map.of(
        "authenticated",
        true,
        "username",
        a.id(),
        "roles",
        a.roles(),
        "scope_id",
        a.scope(),
        "platform_admin",
        platformAdmin,
        "company_portal",
        companyPortal,
        "home_workspace",
        homeWorkspace,
        "scope_name",
        jdbc.sql("SELECT label FROM meta.scope WHERE scope_id=:scope")
            .param("scope", a.scope())
            .query(String.class)
            .optional()
            .orElse(a.scope()),
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
