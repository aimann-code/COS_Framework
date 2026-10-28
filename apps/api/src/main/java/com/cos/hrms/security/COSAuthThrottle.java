package com.cos.hrms.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import org.springframework.web.filter.OncePerRequestFilter;

/** Local browser authentication throttling; no client-supplied forwarding headers are trusted. */
public class COSAuthThrottle extends OncePerRequestFilter {
  private record Window(long started, int count) {}

  private final Map<String, Window> windows = new LinkedHashMap<>();

  private synchronized boolean allow(String key, int limit, long now) {
    windows.entrySet().removeIf(e -> now - e.getValue().started() > 900_000);
    var previous = windows.get(key);
    if (previous != null && previous.count() >= limit) return false;
    if (windows.size() >= 10_000 && !windows.containsKey(key)) return false;
    windows.put(
        key,
        new Window(
            previous == null ? now : previous.started(),
            previous == null ? 1 : previous.count() + 1));
    return true;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getServletPath();
    boolean login = path.equals("/api/v1/cos/login") || path.equals("/api/v1/cos/auth/token");
    boolean signup = path.equals("/api/v1/cos/auth/sign-up");
    if (request.getMethod().equals("POST")
        && (login || signup)
        && !allow(request.getRemoteAddr() + path, login ? 40 : 15, System.currentTimeMillis())) {
      response.setStatus(429);
      response.setHeader("Retry-After", "900");
      response.setContentType("application/problem+json");
      response
          .getWriter()
          .write(
              "{\"status\":429,\"title\":\"Too Many"
                  + " Requests\",\"error_code\":\"AUTH_RATE_LIMITED\",\"detail\":\"Too many"
                  + " attempts. Please try again in 15 minutes.\"}");
      return;
    }
    chain.doFilter(request, response);
  }
}
