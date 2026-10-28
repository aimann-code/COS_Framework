package com.cos.shared.commerce;

import com.cos.shared.COSError;
import com.cos.shared.config.COSProperties;
import com.cos.shared.security.COSActor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Enforces service entitlements on server routes; hiding a navigation item is not authorization.
 */
@Configuration
public class ServiceEntitlementGuard implements WebMvcConfigurer {
  private final JdbcClient jdbc;
  private final COSProperties properties;

  public ServiceEntitlementGuard(JdbcClient jdbc, COSProperties properties) {
    this.jdbc = jdbc;
    this.properties = properties;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(
            new HandlerInterceptor() {
              @Override
              public boolean preHandle(
                  HttpServletRequest request, HttpServletResponse response, Object handler) {
                var authentication = SecurityContextHolder.getContext().getAuthentication();
                if (authentication == null
                    || !authentication.isAuthenticated()
                    || authentication.getName().equals("anonymousUser")) return true;
                COSActor actor = COSActor.from(authentication, properties);
                if (jdbc.sql("SELECT count(*) FROM commerce.company WHERE scope_id=:scope")
                        .param("scope", actor.scope())
                        .query(Long.class)
                        .single()
                    == 0) return true;
                List<String> services =
                    jdbc.sql(
                            "SELECT DISTINCT s.service_code FROM commerce.service_descriptor s,"
                                + " jsonb_array_elements_text(s.api_prefixes) prefix WHERE"
                                + " :path=prefix OR :path LIKE prefix || '/%'")
                        .param("path", request.getRequestURI())
                        .query(String.class)
                        .list();
                for (String service : services) {
                  if (jdbc.sql(
                              "SELECT count(*) FROM commerce.entitlement WHERE scope_id=:scope"
                                  + " AND service_code=:service AND state='ACTIVE'")
                          .param("scope", actor.scope())
                          .param("service", service)
                          .query(Long.class)
                          .single()
                      == 0)
                    throw new COSError(
                        403,
                        "SERVICE_NOT_SUBSCRIBED",
                        "This company does not have an active subscription to this service.");
                }
                if (request.getMethod().equals("PUT")
                    && request.getRequestURI().startsWith("/api/v1/cos/leave/policies/"))
                  throw new COSError(
                      403,
                      "PLATFORM_APPROVAL_REQUIRED",
                      "Company policy configuration requires platform review. Direct policy changes"
                          + " are disabled.");
                return true;
              }
            })
        .addPathPatterns("/api/v1/cos/**");
  }
}
