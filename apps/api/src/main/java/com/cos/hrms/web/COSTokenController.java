package com.cos.hrms.web;

import com.cos.hrms.config.COSProperties;
import com.cos.hrms.security.COSJwtService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!oidc")
@RequestMapping("/api/v1/cos/auth")
public class COSTokenController {
  private final AuthenticationManager authentication;
  private final COSJwtService jwt;
  private final COSProperties properties;

  public COSTokenController(
      AuthenticationManager authentication, COSJwtService jwt, COSProperties properties) {
    this.authentication = authentication;
    this.jwt = jwt;
    this.properties = properties;
  }

  @PostMapping("/token")
  public Map<String, Object> token(
      @Valid @RequestBody Login input, HttpServletRequest request, HttpServletResponse response) {
    var auth =
        authentication.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(input.username(), input.password()));
    String token = jwt.issue(auth, properties.getScopeId());
    jwt.write(request, response, token);
    return Map.of(
        "token_type",
        "Bearer",
        "access_token",
        token,
        "expires_in",
        COSJwtService.TTL.toSeconds(),
        "scope_id",
        properties.getScopeId());
  }

  public record Login(@NotBlank String username, @NotBlank String password) {}
}
