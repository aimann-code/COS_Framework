package com.cos.hrms.onboarding;

import static com.cos.hrms.onboarding.EmpUniqueKeyContracts.*;
import com.cos.hrms.config.COSProperties;
import com.cos.hrms.security.COSActor;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/api/v1/emp/unique-key", "/api/v1/cos/onboarding/unique-key"})
public class EmpUniqueKeyController {
  private final EmpUniqueKeyService service;
  private final COSProperties properties;
  public EmpUniqueKeyController(EmpUniqueKeyService service,COSProperties properties) {
    this.service=service; this.properties=properties;
  }
  @GetMapping
  public RuleResDTO read(Authentication auth) { return service.read(COSActor.from(auth,properties)); }
  @PutMapping
  public RuleResDTO activate(Authentication auth,@Valid @RequestBody ActivateReqDTO body) {
    return service.activate(COSActor.from(auth,properties),body);
  }
}
