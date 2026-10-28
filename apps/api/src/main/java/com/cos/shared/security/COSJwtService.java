package com.cos.shared.security;

import com.cos.shared.config.COSProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.SecretKey;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component
@Profile("!oidc")
public class COSJwtService {
  public static final String COOKIE = "COS_ACCESS";
  public static final Duration TTL = Duration.ofMinutes(30);
  private final SecretKey key;
  private final COSProperties properties;
  private final Map<String, Instant> revoked = new ConcurrentHashMap<>();

  public COSJwtService(COSProperties properties) {
    byte[] secret;
    try {
      secret =
          Base64.getDecoder()
              .decode(properties.getJwtSecret() == null ? "" : properties.getJwtSecret());
    } catch (IllegalArgumentException e) {
      throw new IllegalStateException("COS_JWT_SECRET must be base64.");
    }
    if (secret.length < 32)
      throw new IllegalStateException("COS_JWT_SECRET must decode to at least 32 bytes.");
    this.key = io.jsonwebtoken.security.Keys.hmacShaKeyFor(secret);
    this.properties = properties;
  }

  public String issue(Authentication auth, String scope) {
    Instant now = Instant.now();
    List<String> roles =
        auth.getAuthorities().stream()
            .map(a -> a.getAuthority().replaceFirst("^ROLE_", ""))
            .toList();
    return Jwts.builder()
        .issuer("cos-hrms")
        .id(UUID.randomUUID().toString())
        .subject(auth.getName())
        .claim("roles", roles)
        .claim("entity_scope", scope)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(TTL)))
        .signWith(key)
        .compact();
  }

  public Jws<Claims> parse(String token) {
    return Jwts.parser()
        .verifyWith(key)
        .requireIssuer("cos-hrms")
        .clockSkewSeconds(30)
        .build()
        .parseSignedClaims(token);
  }

  public void attach(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response,
      Authentication auth,
      String scope) {
    write(request, response, issue(auth, scope));
  }

  public void write(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response,
      String token) {
    response.addHeader(HttpHeaders.SET_COOKIE, cookie(request, token, TTL).toString());
  }

  public void clear(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    response.addHeader(HttpHeaders.SET_COOKIE, cookie(request, "", Duration.ZERO).toString());
  }

  public void revokePresented(HttpServletRequest request) {
    String bearer = presentedBearer(request);
    String cookie = presentedCookie(request);
    if (bearer != null) revoke(bearer);
    if (cookie != null && !cookie.equals(bearer)) revoke(cookie);
  }

  public boolean revoked(String tokenId) {
    if (tokenId == null || tokenId.isBlank()) return false;
    Instant expiry = revoked.get(tokenId);
    if (expiry == null) return false;
    if (!expiry.isAfter(Instant.now())) {
      revoked.remove(tokenId, expiry);
      return false;
    }
    return true;
  }

  private void revoke(String token) {
    try {
      var claims = parse(token).getPayload();
      if (claims.getId() != null && claims.getExpiration() != null)
        revoked.put(claims.getId(), claims.getExpiration().toInstant());
    } catch (io.jsonwebtoken.JwtException | IllegalArgumentException ignored) {
      // An unreadable credential cannot authenticate again.
    }
    Instant now = Instant.now();
    revoked.entrySet().removeIf(entry -> !entry.getValue().isAfter(now));
  }

  private String presentedBearer(HttpServletRequest request) {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) return null;
    String token = header.substring(7).trim();
    return token.isEmpty() ? null : token;
  }

  private String presentedCookie(HttpServletRequest request) {
    if (request.getCookies() == null) return null;
    for (Cookie cookie : request.getCookies())
      if (COOKIE.equals(cookie.getName())
          && cookie.getValue() != null
          && !cookie.getValue().isBlank()) return cookie.getValue();
    return null;
  }

  private ResponseCookie cookie(
      jakarta.servlet.http.HttpServletRequest request, String value, Duration age) {
    return ResponseCookie.from(COOKIE, value)
        .httpOnly(true)
        .secure(properties.isCookieSecure() || request.isSecure())
        .sameSite(properties.isCookieSecure() || request.isSecure() ? "Strict" : "Lax")
        .path("/")
        .maxAge(age)
        .build();
  }
}
