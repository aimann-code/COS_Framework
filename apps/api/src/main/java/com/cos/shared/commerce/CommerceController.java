package com.cos.shared.commerce;

import static com.cos.shared.commerce.CommerceContracts.*;

import com.cos.shared.config.COSProperties;
import com.cos.shared.security.COSActor;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!oidc")
@RequestMapping("/api/v1/cos")
public class CommerceController {
  private final CommerceService commerce;
  private final COSProperties properties;

  public CommerceController(CommerceService commerce, COSProperties properties) {
    this.commerce = commerce;
    this.properties = properties;
  }

  @GetMapping("/services/catalog")
  public Catalog catalog() {
    return commerce.catalog();
  }

  @PostMapping("/companies/register")
  @ResponseStatus(HttpStatus.CREATED)
  public RegistrationView register(@Valid @RequestBody Register input) {
    return commerce.register(input);
  }

  @PostMapping("/companies/{id}/status")
  public RegistrationView status(@PathVariable UUID id, @Valid @RequestBody Token input) {
    return commerce.status(id, input);
  }

  @PostMapping("/companies/{id}/payment")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public PaymentView payment(@PathVariable UUID id, @Valid @RequestBody PaymentDeclaration input) {
    return commerce.declarePayment(id, input);
  }

  @GetMapping("/platform/overview")
  public Overview overview(Authentication auth) {
    return commerce.overview(actor(auth));
  }

  @GetMapping("/platform/services")
  public java.util.List<ServiceView> services(Authentication auth) {
    commerce.requireOperator(actor(auth));
    return commerce.catalog().services();
  }

  @PostMapping("/platform/payments/{id}/review")
  public PaymentView reviewPayment(
      Authentication auth, @PathVariable UUID id, @Valid @RequestBody Review input) {
    return commerce.reviewPayment(actor(auth), id, input);
  }

  @PutMapping("/platform/services/{code}")
  public Catalog updateCatalog(
      Authentication auth, @PathVariable String code, @Valid @RequestBody CatalogUpdate input) {
    return commerce.updateCatalog(actor(auth), code, input);
  }

  @GetMapping("/company/workspace")
  public Workspace workspace(Authentication auth) {
    return commerce.workspace(actor(auth));
  }

  @PostMapping("/company/configuration-requests")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public ConfigurationView request(
      Authentication auth, @Valid @RequestBody ConfigurationSubmit input) {
    return commerce.submitConfiguration(actor(auth), input);
  }

  @PostMapping("/platform/configuration-requests/{id}/review")
  public ConfigurationView reviewConfiguration(
      Authentication auth, @PathVariable UUID id, @Valid @RequestBody Review input) {
    return commerce.reviewConfiguration(actor(auth), id, input);
  }

  private COSActor actor(Authentication auth) {
    return COSActor.from(auth, properties);
  }
}
