package com.cos.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class COSAuthThrottleTest {
  @Test
  void companyAndAccountRegistrationShareARemoteAddressBudget() throws Exception {
    var throttle = new COSAuthThrottle();
    for (int attempt = 0; attempt < 15; attempt++) {
      var response =
          register(
              throttle,
              attempt % 2 == 0 ? "/api/v1/cos/companies/register" : "/api/v1/cos/auth/sign-up",
              "192.0.2.1",
              attempt);
      assertThat(response.getStatus()).isEqualTo(204);
    }
    var blocked = register(throttle, "/api/v1/cos/companies/register", "192.0.2.1", 99);
    assertThat(blocked.getStatus()).isEqualTo(429);
    assertThat(blocked.getHeader("Retry-After")).isEqualTo("900");
    assertThat(register(throttle, "/api/v1/cos/auth/sign-up", "192.0.2.1", 100).getStatus())
        .isEqualTo(429);
    assertThat(register(throttle, "/api/v1/cos/companies/register", "192.0.2.2", 101).getStatus())
        .isEqualTo(204);
  }

  private MockHttpServletResponse register(
      COSAuthThrottle throttle, String path, String remote, int forwarded) throws Exception {
    var request = new MockHttpServletRequest("POST", path);
    request.setServletPath(path);
    request.setRemoteAddr(remote);
    request.addHeader("X-Forwarded-For", "198.51.100." + forwarded);
    var response = new MockHttpServletResponse();
    throttle.doFilter(
        request,
        response,
        (req, res) -> ((jakarta.servlet.http.HttpServletResponse) res).setStatus(204));
    return response;
  }
}
