package com.cos.shared.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cos.shared.COSJson;
import com.cos.shared.account.COSAccountService;
import com.cos.shared.metadata.COSMetadataService;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import jakarta.servlet.http.Cookie;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(
    properties = {
      "cos.scope-id=TEST",
      "cos.id-prefix=TEST-",
      "cos.manual-id-pattern=[A-Za-z0-9_-]{1,64}",
      "cos.worker-enabled=false",
      "cos.cookie-secure=true",
      "cos.registrar-password=integration-test-password",
      "cos.admin-password=integration-test-password",
      "cos.reviewer-password=integration-test-password",
      "cos.viewer-password=integration-test-password"
    })
@ActiveProfiles("test")
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AuthenticationNavigationTest {
  @TestConfiguration
  static class Database {
    @Bean(destroyMethod = "close")
    EmbeddedPostgres postgres() throws Exception {
      return EmbeddedPostgres.builder()
          .setServerConfig("listen_addresses", "127.0.0.1")
          .setPort(0)
          .start();
    }

    @Bean
    DataSource dataSource(EmbeddedPostgres pg) {
      return pg.getPostgresDatabase();
    }
  }

  @Autowired MockMvc mvc;
  @Autowired COSMetadataService metadata;
  @Autowired COSAccountService accounts;
  @Autowired COSJson json;

  @BeforeAll
  void seed() {
    metadata.seedLocal("TEST");
  }

  @Test
  void protectedApiRejectsAnonymousAndBadPasswords() throws Exception {
    mvc.perform(get("/api/v1/cos/accounts/pending"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error_code").value("UNAUTHENTICATED"));
    MvcResult rejected =
        mvc.perform(
                post("/api/v1/cos/login")
                    .with(csrf())
                    .param("username", "registrar")
                    .param("password", "wrong-test-password"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error_code").value("INVALID_CREDENTIALS"))
            .andReturn();
    assertThat(rejected.getResponse().getContentAsString()).doesNotContain("wrong-test-password");
  }

  @Test
  void cookieAuthorizesNavigationAndLogoutRevokesIt() throws Exception {
    MvcResult login =
        mvc.perform(
                post("/api/v1/cos/login")
                    .with(csrf())
                    .param("username", "registrar")
                    .param("password", "integration-test-password"))
            .andExpect(status().isNoContent())
            .andReturn();
    String setCookie =
        login.getResponse().getHeaders("Set-Cookie").stream()
            .filter(value -> value.startsWith("COS_ACCESS="))
            .findFirst()
            .orElseThrow();
    assertThat(setCookie).contains("HttpOnly", "Secure", "SameSite=Strict");
    String token = setCookie.substring("COS_ACCESS=".length(), setCookie.indexOf(';'));
    Cookie access = new Cookie("COS_ACCESS", token);
    mvc.perform(get("/api/v1/cos/accounts/pending").cookie(access)).andExpect(status().isOk());
    mvc.perform(post("/api/v1/cos/logout").cookie(access))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error_code").value("CSRF_INVALID"));
    mvc.perform(post("/api/v1/cos/logout").cookie(access).with(csrf()))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/v1/cos/accounts/pending").cookie(access))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void bearerSkipsCsrfAndLogoutRevokesThatToken() throws Exception {
    MvcResult issued =
        mvc.perform(
                post("/api/v1/cos/auth/token")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"username\":\"registrar\",\"password\":\"integration-test-password\"}"))
            .andExpect(status().isOk())
            .andReturn();
    String token =
        json.read(issued.getResponse().getContentAsString(), tools.jackson.databind.JsonNode.class)
            .get("access_token")
            .asString();
    mvc.perform(get("/api/v1/cos/accounts/pending").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());
    mvc.perform(post("/api/v1/cos/logout").header("Authorization", "Bearer " + token))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/v1/cos/accounts/pending").header("Authorization", "Bearer " + token))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void viewerCannotOpenHrAccountReview() throws Exception {
    MvcResult login =
        mvc.perform(
                post("/api/v1/cos/login")
                    .with(csrf())
                    .param("username", "viewer")
                    .param("password", "integration-test-password"))
            .andExpect(status().isNoContent())
            .andReturn();
    String setCookie =
        login.getResponse().getHeaders("Set-Cookie").stream()
            .filter(value -> value.startsWith("COS_ACCESS="))
            .findFirst()
            .orElseThrow();
    String token = setCookie.substring("COS_ACCESS=".length(), setCookie.indexOf(';'));
    mvc.perform(get("/api/v1/cos/accounts/pending").cookie(new Cookie("COS_ACCESS", token)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error_code").value("FORBIDDEN"));
  }

  @Test
  void pendingSignupCannotSignIn() throws Exception {
    accounts.signup(
        new COSAccountService.Signup(
            "Synthetic Applicant", "synthetic-auth@example.test", "synthetic-test-passphrase"));
    mvc.perform(
            post("/api/v1/cos/login")
                .with(csrf())
                .param("username", "synthetic-auth@example.test")
                .param("password", "synthetic-test-passphrase"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error_code").value("INVALID_CREDENTIALS"));
  }
}
