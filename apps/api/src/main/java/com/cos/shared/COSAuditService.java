package com.cos.shared;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class COSAuditService {
  private final JdbcClient jdbc;

  public COSAuditService(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional
  public void record(
      String scope, String actor, UUID request, String action, String target, String outcome) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO"
                + " audit.event(event_id,readable_id,scope_id,actor_id,request_id,action,target_key,outcome)"
                + " VALUES(:id,:readable,:scope,:actor,:request,:action,:target,:outcome)")
        .param("id", id)
        .param("readable", "LOCAL-AUD-" + id)
        .param("scope", scope)
        .param("actor", actor)
        .param("request", request, java.sql.Types.OTHER)
        .param("action", action)
        .param("target", target)
        .param("outcome", outcome)
        .update();
  }
}
