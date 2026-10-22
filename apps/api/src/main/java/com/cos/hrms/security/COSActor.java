package com.cos.hrms.security;

import com.cos.hrms.config.COSProperties;
import com.cos.hrms.shared.COSError;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

public record COSActor(String id, String scope, Set<String> roles) {
  public static COSActor from(Authentication auth, COSProperties properties) {
    if (auth == null || !auth.isAuthenticated() || auth.getName().equals("anonymousUser"))
      throw new COSError(401, "UNAUTHENTICATED", "Sign in to continue.");
    String scope =
        auth.getPrincipal() instanceof Jwt jwt
            ? jwt.getClaimAsString("entity_scope")
            : properties.getScopeId();
    if (scope == null || scope.isBlank()) throw COSError.forbidden();
    return new COSActor(
        auth.getName(),
        scope,
        auth.getAuthorities().stream()
            .map(a -> a.getAuthority().replaceFirst("^ROLE_", ""))
            .collect(Collectors.toSet()));
  }

  public boolean admin() {
    return roles.contains("ADMIN");
  }

  public void require(String role) {
    if (!roles.contains(role)) throw COSError.forbidden();
  }

  public boolean permitted(java.util.List<String> permitted) {
    return permitted != null && permitted.stream().anyMatch(roles::contains);
  }
}
