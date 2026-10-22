package com.cos.hrms.account;

import com.cos.hrms.config.COSProperties;
import com.cos.hrms.security.COSActor;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile({"local", "test"})
@RequestMapping("/api/v1/cos")
public class COSAccountController {
  private final COSAccountService accounts;
  private final com.cos.hrms.onboarding.OnboardingAccountService onboarding;
  private final COSProperties properties;

  public COSAccountController(
      COSAccountService accounts,
      COSProperties properties,
      com.cos.hrms.onboarding.OnboardingAccountService onboarding) {
    this.onboarding = onboarding;
    this.accounts = accounts;
    this.properties = properties;
  }

  @PostMapping("/auth/sign-up")
  public ResponseEntity<Map<String, String>> signup(
      @Valid @RequestBody COSAccountService.Signup input) {
    accounts.signup(input);
    return ResponseEntity.accepted()
        .body(
            Map.of(
                "status",
                "PENDING",
                "message",
                "If this address is eligible, your access request is awaiting HR" + " review."));
  }

  @GetMapping("/accounts/pending")
  public List<COSAccountService.AccountView> pending(Authentication authentication) {
    return onboarding.pending(COSActor.from(authentication, properties));
  }

  @PostMapping("/accounts/{id}/review")
  public ResponseEntity<Void> review(
      Authentication authentication,
      @PathVariable UUID id,
      @Valid @RequestBody com.cos.hrms.onboarding.OnboardingAccountService.Review input) {
    onboarding.review(COSActor.from(authentication, properties), id, input);
    return ResponseEntity.noContent().build();
  }
}
