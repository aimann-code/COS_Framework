package com.cos.shared.security;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

/** Authoritative company membership attached to a locally authenticated account. */
public final class COSLocalUser extends User {
  private static final long serialVersionUID = 1L;
  private final String scope;

  public COSLocalUser(String scope, UserDetails user) {
    super(
        user.getUsername(),
        user.getPassword(),
        user.isEnabled(),
        user.isAccountNonExpired(),
        user.isCredentialsNonExpired(),
        user.isAccountNonLocked(),
        user.getAuthorities());
    this.scope = scope;
  }

  public String scope() {
    return scope;
  }
}
