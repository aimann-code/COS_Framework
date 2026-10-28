package com.cos.shared.metadata;

import com.cos.shared.COSError;
import com.cos.shared.security.COSActor;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class COSFavoriteService {
  private final JdbcClient jdbc;

  public COSFavoriteService(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public List<String> accessible(COSActor actor) {
    return actor.admin()
        ? List.of("EMP_Reg", "EMP_Details", "My_Requests", "EMP_Reg_CONFIG")
        : actor.roles().contains("REGISTRAR")
            ? List.of("EMP_Reg", "EMP_Details", "My_Requests")
            : actor.roles().contains("VIEWER") ? List.of("EMP_Details") : List.of();
  }

  @Transactional(readOnly = true)
  public List<String> list(COSActor actor) {
    return jdbc
        .sql(
            "SELECT component_id FROM ui.user_favorite WHERE scope_id=:scope AND actor_id=:actor"
                + " ORDER BY created_at")
        .param("scope", actor.scope())
        .param("actor", actor.id())
        .query(String.class)
        .list()
        .stream()
        .filter(accessible(actor)::contains)
        .toList();
  }

  @Transactional
  public void set(COSActor actor, String component, boolean add) {
    if (!accessible(actor).contains(component)) throw COSError.forbidden();
    if (add)
      jdbc.sql(
              "INSERT INTO ui.user_favorite(scope_id,actor_id,component_id)"
                  + " VALUES(:scope,:actor,:component) ON CONFLICT DO NOTHING")
          .param("scope", actor.scope())
          .param("actor", actor.id())
          .param("component", component)
          .update();
    else
      jdbc.sql(
              "DELETE FROM ui.user_favorite WHERE scope_id=:scope AND actor_id=:actor AND"
                  + " component_id=:component")
          .param("scope", actor.scope())
          .param("actor", actor.id())
          .param("component", component)
          .update();
  }
}
