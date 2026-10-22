package com.cos.hrms.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class COSSecurityConfig {
  @Bean
  @Profile({"local", "test"})
  org.springframework.security.crypto.password.PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  @Profile({"local", "test"})
  UserDetailsService local_users(
      COSProperties p, com.cos.hrms.account.COSAccountRepository accounts) {
    var encoder = new BCryptPasswordEncoder();
    var bootstrap =
        new InMemoryUserDetailsManager(
            User.withUsername("registrar")
                .password(encoder.encode(required(p.getRegistrarPassword())))
                .roles("REGISTRAR")
                .build(),
            User.withUsername("admin")
                .password(encoder.encode(required(p.getAdminPassword())))
                .roles("ADMIN")
                .build(),
            User.withUsername("reviewer")
                .password(encoder.encode(required(p.getReviewerPassword())))
                .roles("ADMIN")
                .build(),
            User.withUsername("viewer")
                .password(encoder.encode(required(p.getViewerPassword())))
                .roles("VIEWER")
                .build());
    return username -> {
      String canonical = username.strip().toLowerCase(java.util.Locale.ROOT);
      if (bootstrap.userExists(canonical)) return bootstrap.loadUserByUsername(canonical);
      var account =
          accounts
              .find(p.getScopeId(), canonical)
              .orElseThrow(
                  () ->
                      new org.springframework.security.core.userdetails.UsernameNotFoundException(
                          "Invalid credentials"));
      return User.withUsername(account.email())
          .password(account.password())
          .roles(account.role() == null ? "VIEWER" : account.role())
          .disabled(!account.status().equals("ACTIVE"))
          .build();
    };
  }

  private String required(String s) {
    if (s == null || s.length() < 16)
      throw new IllegalStateException(
          "Local accounts require externally supplied passwords of at least 16 characters.");
    return s;
  }

  @Bean
  @Profile({"local", "test"})
  SecurityFilterChain local_security(
      HttpSecurity http,
      @org.springframework.beans.factory.annotation.Qualifier("cors_source")
          CorsConfigurationSource source)
      throws Exception {
    http.addFilterBefore(
            new com.cos.hrms.security.COSAuthThrottle(),
            org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
                .class)
        .cors(c -> c.configurationSource(source))
        .csrf(c -> c.csrfTokenRepository(new HttpSessionCsrfTokenRepository()))
        .authorizeHttpRequests(
            c ->
                c.requestMatchers(
                        "/api/v1/cos/csrf",
                        "/api/v1/cos/session",
                        "/api/v1/cos/health",
                        "/api/v1/cos/auth/sign-up")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .formLogin(
            c ->
                c.loginProcessingUrl("/api/v1/cos/login")
                    .successHandler(
                        (req, res, auth) -> {
                          res.setStatus(204);
                        })
                    .failureHandler((req, res, e) -> problem(res, 401, "INVALID_CREDENTIALS")))
        .logout(
            c ->
                c.logoutUrl("/api/v1/cos/logout")
                    .logoutSuccessHandler((req, res, auth) -> res.setStatus(204)))
        .exceptionHandling(
            c ->
                c.authenticationEntryPoint((req, res, e) -> problem(res, 401, "UNAUTHENTICATED"))
                    .accessDeniedHandler(
                        (req, res, e) ->
                            problem(
                                res,
                                403,
                                e instanceof org.springframework.security.web.csrf.CsrfException
                                    ? "CSRF_INVALID"
                                    : "FORBIDDEN")));
    return http.build();
  }

  @Bean
  @Profile("!local & !test")
  SecurityFilterChain production_security(
      HttpSecurity http,
      @org.springframework.beans.factory.annotation.Qualifier("cors_source")
          CorsConfigurationSource source)
      throws Exception {
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(
        jwt -> {
          List<String> roles = jwt.getClaimAsStringList("roles");
          return roles == null
              ? List.of()
              : roles.stream()
                  .filter(r -> List.of("ADMIN", "REGISTRAR", "VIEWER", "EMPLOYEE").contains(r))
                  .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                  .map(a -> (org.springframework.security.core.GrantedAuthority) a)
                  .toList();
        });
    http.cors(c -> c.configurationSource(source))
        .csrf(c -> c.disable())
        .sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            c -> c.requestMatchers("/api/v1/cos/health").permitAll().anyRequest().authenticated())
        .oauth2ResourceServer(c -> c.jwt(j -> j.jwtAuthenticationConverter(converter)))
        .exceptionHandling(
            c ->
                c.authenticationEntryPoint((req, res, e) -> problem(res, 401, "UNAUTHENTICATED"))
                    .accessDeniedHandler((req, res, e) -> problem(res, 403, "FORBIDDEN")));
    return http.build();
  }

  private void problem(jakarta.servlet.http.HttpServletResponse response, int code, String error)
      throws java.io.IOException {
    response.setStatus(code);
    response.setContentType("application/problem+json");
    response
        .getWriter()
        .write(
            "{\"type\":\"about:blank\",\"status\":"
                + code
                + ",\"title\":\""
                + (code == 401 ? "Unauthorized" : "Forbidden")
                + "\",\"error_code\":\""
                + error
                + "\"}");
  }

  @Bean
  CorsConfigurationSource cors_source(COSProperties p) {
    var config = new CorsConfiguration();
    config.setAllowedOrigins(
        Arrays.stream(p.getAllowedOrigins().split(",")).map(String::trim).toList());
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(
        List.of("Content-Type", "X-CSRF-TOKEN", "Idempotency-Key", "Authorization"));
    config.setAllowCredentials(true);
    config.setMaxAge(600L);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }
}
