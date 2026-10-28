package com.cos.shared.account;

import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
@Profile("!oidc")
public class COSAccountRepository {
  public record Account(
      UUID id,
      String scope,
      String name,
      String email,
      String password,
      String status,
      String role,
      Instant created) {}

  private final JdbcClient jdbc;
  private final RowMapper<Account> mapper =
      (r, n) ->
          new Account(
              r.getObject("account_id", UUID.class),
              r.getString("scope_id"),
              r.getString("full_name"),
              r.getString("email"),
              r.getString("password_hash"),
              r.getString("status"),
              r.getString("role"),
              r.getTimestamp("created_at").toInstant());

  public COSAccountRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<Account> find(String scope, String email) {
    return jdbc.sql("SELECT * FROM auth.account WHERE scope_id=:scope AND email=:email")
        .param("scope", scope)
        .param("email", email)
        .query(mapper)
        .optional();
  }

  public Optional<Account> get(String scope, UUID id) {
    return jdbc.sql(
            "SELECT * FROM auth.account WHERE scope_id=:scope AND account_id=:id FOR UPDATE")
        .param("scope", scope)
        .param("id", id)
        .query(mapper)
        .optional();
  }

  public void create(String scope, String name, String email, String password) {
    jdbc.sql(
            "INSERT INTO auth.account(account_id,scope_id,full_name,email,password_hash)"
                + " VALUES(:id,:scope,:name,:email,:password) ON CONFLICT(scope_id,email) DO"
                + " NOTHING")
        .param("id", UUID.randomUUID())
        .param("scope", scope)
        .param("name", name)
        .param("email", email)
        .param("password", password)
        .update();
  }

  public List<Account> pending(String scope) {
    return jdbc.sql(
            "SELECT * FROM auth.account WHERE scope_id=:scope AND status='PENDING' ORDER BY"
                + " created_at LIMIT 100")
        .param("scope", scope)
        .query(mapper)
        .list();
  }

  public void review(UUID id, String status, String role, String actor, String note) {
    jdbc.sql(
            "UPDATE auth.account SET"
                + " status=:status,role=:role,reviewed_by=:actor,reviewed_at=now(),review_note=:note"
                + " WHERE account_id=:id AND status='PENDING'")
        .param("id", id)
        .param("status", status)
        .param("role", role, java.sql.Types.VARCHAR)
        .param("actor", actor)
        .param("note", note)
        .update();
  }
}
