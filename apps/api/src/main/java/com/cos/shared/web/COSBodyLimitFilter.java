package com.cos.shared.web;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounds JSON commands before deserialization, including chunked requests. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class COSBodyLimitFilter extends OncePerRequestFilter {
  private static final int MAX_BYTES = 1_048_576;

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (request.getContentType() == null
        || !request.getContentType().startsWith("application/json")) {
      chain.doFilter(request, response);
      return;
    }
    byte[] body = request.getInputStream().readNBytes(MAX_BYTES + 1);
    if (body.length > MAX_BYTES) {
      response.setStatus(413);
      response.setContentType("application/problem+json");
      response
          .getWriter()
          .write(
              "{\"type\":\"about:blank\",\"status\":413,\"title\":\"Payload Too"
                  + " Large\",\"error_code\":\"BODY_TOO_LARGE\"}");
      return;
    }
    chain.doFilter(
        new HttpServletRequestWrapper(request) {
          @Override
          public ServletInputStream getInputStream() {
            var input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
              @Override
              public int read() {
                return input.read();
              }

              @Override
              public boolean isFinished() {
                return input.available() == 0;
              }

              @Override
              public boolean isReady() {
                return true;
              }

              @Override
              public void setReadListener(ReadListener listener) {
                throw new UnsupportedOperationException("Blocking JSON input only");
              }
            };
          }

          @Override
          public BufferedReader getReader() {
            return new BufferedReader(
                new InputStreamReader(getInputStream(), java.nio.charset.StandardCharsets.UTF_8));
          }
        },
        response);
  }
}
