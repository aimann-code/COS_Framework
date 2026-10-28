package com.cos.shared.registry;

import com.cos.shared.config.COSProperties;
import com.cos.shared.security.COSActor;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/cos")
public class PlatformController {
  private final COSProperties properties;
  private final FieldRegistryService registry;
  private final FieldValueService values;
  private final IdentityLinkService identities;
  private final SyncService sync;
  private final ReportService reports;

  public PlatformController(
      COSProperties properties,
      FieldRegistryService registry,
      FieldValueService values,
      IdentityLinkService identities,
      SyncService sync,
      ReportService reports) {
    this.properties = properties;
    this.registry = registry;
    this.values = values;
    this.identities = identities;
    this.sync = sync;
    this.reports = reports;
  }

  private COSActor actor(org.springframework.security.core.Authentication authentication) {
    return COSActor.from(authentication, properties);
  }

  @GetMapping("/fields")
  public List<FieldRegistryService.FieldView> fields(
      org.springframework.security.core.Authentication authentication) {
    return registry.listFields(actor(authentication));
  }

  @PostMapping("/fields")
  public FieldRegistryService.FieldView field(
      org.springframework.security.core.Authentication authentication,
      @RequestBody FieldRegistryService.FieldRegistration input) {
    return registry.registerField(actor(authentication), input);
  }

  @GetMapping("/tables")
  public List<FieldRegistryService.TableView> tables(
      org.springframework.security.core.Authentication authentication) {
    return registry.listTables(actor(authentication));
  }

  @PostMapping("/tables")
  public FieldRegistryService.TableView table(
      org.springframework.security.core.Authentication authentication,
      @RequestBody FieldRegistryService.TableRegistration input) {
    return registry.registerTable(actor(authentication), input);
  }

  @GetMapping("/employees/{id}/field-values")
  public List<FieldValueService.StoredValue> values(
      org.springframework.security.core.Authentication authentication, @PathVariable UUID id) {
    return values.read(actor(authentication), id);
  }

  @PutMapping("/employees/{id}/field-values")
  public List<FieldValueService.StoredValue> saveValues(
      org.springframework.security.core.Authentication authentication,
      @PathVariable UUID id,
      @RequestBody FieldValueService.ValueWrite input) {
    return values.save(actor(authentication), id, input);
  }

  @GetMapping("/employees/{id}/identity-links")
  public List<IdentityLinkService.LinkView> links(
      org.springframework.security.core.Authentication authentication, @PathVariable UUID id) {
    return identities.list(actor(authentication), id);
  }

  @PostMapping("/identity-links")
  public IdentityLinkService.LinkView link(
      org.springframework.security.core.Authentication authentication,
      @RequestBody IdentityLinkService.LinkWrite input) {
    return identities.link(actor(authentication), input);
  }

  @PostMapping("/identity-links/{id}/close")
  public IdentityLinkService.LinkView close(
      org.springframework.security.core.Authentication authentication,
      @PathVariable UUID id,
      @RequestBody IdentityLinkService.CloseLink input) {
    return identities.close(actor(authentication), id, input);
  }

  @PostMapping("/sync-records")
  public SyncService.SyncView sync(
      org.springframework.security.core.Authentication authentication,
      @RequestBody SyncService.SyncWrite input) {
    return sync.record(actor(authentication), input);
  }

  @PostMapping("/sync-records/absence")
  public SyncService.AbsenceResult absent(
      org.springframework.security.core.Authentication authentication,
      @RequestBody SyncService.Absence input) {
    return sync.markAbsent(actor(authentication), input);
  }

  @GetMapping("/reports/employee-master")
  public List<ReportService.MasterRow> master(
      org.springframework.security.core.Authentication authentication) {
    return reports.employeeMaster(actor(authentication));
  }

  @GetMapping("/reports/tables/{technicalName}")
  public ReportService.TableReport report(
      org.springframework.security.core.Authentication authentication,
      @PathVariable String technicalName) {
    return reports.table(actor(authentication), technicalName);
  }
}
