package com.cos.hrms.leave;

import static com.cos.hrms.leave.LeaveContracts.*;

import com.cos.shared.config.COSProperties;
import com.cos.shared.security.COSActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequestMapping("/api/v1/cos/leave")
public class LeaveController {
  private final LeaveService leave;
  private final COSProperties properties;

  public LeaveController(LeaveService leave, COSProperties properties) {
    this.leave = leave;
    this.properties = properties;
  }

  private COSActor actor(Authentication authentication) {
    return COSActor.from(authentication, properties);
  }

  @GetMapping("/catalog")
  public Catalog catalog(Authentication authentication, @RequestParam(required = false) UUID employee) {
    return leave.catalog(actor(authentication), employee);
  }

  @GetMapping("/employees")
  public EmployeeMatch employee(Authentication authentication, @RequestParam String code) {
    return leave.findByCode(actor(authentication), code);
  }

  @GetMapping("/requests")
  public List<RequestView> requests(Authentication authentication) {
    return leave.requests(actor(authentication));
  }

  @PutMapping("/policies/{code}")
  public PolicyView savePolicy(
      Authentication authentication,
      @PathVariable @Pattern(regexp = "[A-Z][A-Z0-9_]{1,31}") String code,
      @Valid @RequestBody PolicyCommand command) {
    return leave.savePolicy(actor(authentication), code, command);
  }

  @PostMapping("/requests")
  public RequestView submit(Authentication authentication, @Valid @RequestBody Submit command) {
    return leave.submit(actor(authentication), command);
  }

  @PostMapping("/requests/{id}/decision")
  public RequestView decide(
      Authentication authentication, @PathVariable UUID id, @Valid @RequestBody Decision command) {
    return leave.decide(actor(authentication), id, command);
  }
}
