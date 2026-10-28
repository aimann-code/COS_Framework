package com.cos.shared.security;

import com.cos.shared.config.COSProperties;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.filter.OncePerRequestFilter;

public class COSJwtFilter extends OncePerRequestFilter {
  private static final Set<String> AMBIENT =
      Set.of("/api/v1/cos/login", "/api/v1/cos/auth/token", "/api/v1/cos/csrf", "/api/v1/cos/health", "/api/v1/cos/auth/sign-up");
  private final COSJwtService jwt;
  private final UserDetailsService users;
  private final COSProperties properties;

  public COSJwtFilter(COSJwtService jwt, UserDetailsService users, COSProperties properties) {
    this.jwt = jwt;
    this.users = users;
    this.properties = properties;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws jakarta.servlet.ServletException, IOException {
    String bearer = bearer(request);
    String cookie = cookie(request);
    String token = bearer != null ? bearer : cookie;
    if (token == null || token.isBlank()) {
      chain.doFilter(request, response);
      return;
    }
    try {
      var claims = jwt.parse(token).getPayload();
      String scope = claims.get("entity_scope", String.class);
      if (scope == null || !scope.equals(properties.getScopeId())) throw new JwtException("scope");
      if (jwt.revoked(claims.getId())) throw new JwtException("revoked");
      var user = users.loadUserByUsername(claims.getSubject());
      if (!user.isEnabled()
          || !user.isAccountNonLocked()
          || !user.isAccountNonExpired()
          || !user.isCredentialsNonExpired()) throw new JwtException("disabled");
      SecurityContextHolder.getContext()
          .setAuthentication(
              UsernamePasswordAuthenticationToken.authenticated(
                  user.getUsername(), null, user.getAuthorities()));
      chain.doFilter(request, response);
    } catch (DataAccessException failure) {
      SecurityContextHolder.clearContext();
      problem(response, 500, "INTERNAL_ERROR");
    } catch (JwtException | UsernameNotFoundException | IllegalArgumentException rejected) {
      SecurityContextHolder.clearContext();
      if (bearer == null && AMBIENT.contains(request.getRequestURI())) {
        jwt.clear(request, response);
        chain.doFilter(request, response);
        return;
      }
      problem(response, 401, "UNAUTHENTICATED");
    }
  }

  private String bearer(HttpServletRequest request) {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) return null;
    return header.substring(7).trim();
  }

  private String cookie(HttpServletRequest request) {
    if (request.getCookies() == null) return null;
    for (Cookie cookie : request.getCookies())
      if (COSJwtService.COOKIE.equals(cookie.getName())) return cookie.getValue();
    return null;
  }

  private void problem(HttpServletResponse response, int code, String error) throws IOException {
    response.setStatus(code);
    response.setContentType("application/problem+json");
    response
        .getWriter()
        .write(
            "{\"type\":\"about:blank\",\"status\":"
                + code
                + ",\"title\":\""
                + (code == 401 ? "Unauthorized" : "Internal Server Error")
                + "\",\"error_code\":\""
                + error
                + "\"}");
  }
}
