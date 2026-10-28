package com.cos.shared.metadata;

import com.cos.shared.COSError;
import com.cos.shared.component.COSComponent;
import com.cos.shared.security.COSActor;
import java.util.Arrays;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

public final class ModuleCatalog {
  private ModuleCatalog() {}

  public record ModuleView(
      String module_code, String name, String route, boolean enabled, List<String> audience) {}

  @Repository
  public static class ModuleRepository {
    private final JdbcClient jdbc;

    public ModuleRepository(JdbcClient jdbc) {
      this.jdbc = jdbc;
    }

    public void ensure(String scope, String code, String name, String route, String audience) {
      if (!scopeExists(scope)) return;
      jdbc.sql(
              "INSERT INTO meta.module(scope_id,module_code,name,route,audience,enabled,metadata)"
                  + " SELECT :scope,:code,:name,:route,:audience,true,'{}'::jsonb"
                  + " WHERE NOT EXISTS (SELECT 1 FROM meta.module WHERE scope_id=:scope AND module_code=:code)")
          .param("scope", scope)
          .param("code", code)
          .param("name", name)
          .param("route", route)
          .param("audience", audience)
          .update();
    }

    public void setEnabled(String scope, String code, boolean enabled) {
      jdbc.sql(
              "UPDATE meta.module SET enabled=:enabled WHERE scope_id=:scope AND module_code=:code")
          .param("enabled", enabled)
          .param("scope", scope)
          .param("code", code)
          .update();
    }

    public List<ModuleView> list(String scope) {
      return jdbc.sql("SELECT * FROM meta.module WHERE scope_id=:scope AND enabled=true ORDER BY module_code")
          .param("scope", scope)
          .query(
              (r, n) ->
                  new ModuleView(
                      r.getString("module_code"),
                      r.getString("name"),
                      r.getString("route"),
                      r.getBoolean("enabled"),
                      Arrays.asList(r.getString("audience").split(","))))
          .list();
    }

    private boolean scopeExists(String scope) {
      Long count =
          jdbc.sql("SELECT count(*) FROM meta.scope WHERE scope_id=:scope")
              .param("scope", scope)
              .query(Long.class)
              .single();
      return count != null && count > 0;
    }
  }

  @Service
  public static class ModuleService {
    private final ModuleRepository repository;
    private final List<COSComponent> components;

    public ModuleService(ModuleRepository repository, List<COSComponent> components) {
      this.repository = repository;
      this.components = components;
    }

    @Transactional
    public void ensure(String scope) {
      for (COSComponent component : components) {
        for (COSComponent.Module module : component.modules()) {
          repository.ensure(scope, module.code(), module.name(), module.route(), module.audience());
        }
      }
    }

    @Transactional
    public List<ModuleView> list(COSActor actor) {
      if (!actor.admin() && !actor.roles().contains("REGISTRAR")) actor.require("EMPLOYEE");
      ensure(actor.scope());
      return repository.list(actor.scope()).stream()
          .filter(module -> actor.admin() || actor.permitted(module.audience()))
          .toList();
    }
  }

  @RestController
  @RequestMapping("/api/v1/cos/modules")
  public static class ModuleController {
    private final ModuleService modules;
    private final com.cos.shared.config.COSProperties properties;

    public ModuleController(ModuleService modules, com.cos.shared.config.COSProperties properties) {
      this.modules = modules;
      this.properties = properties;
    }

    @GetMapping
    public List<ModuleView> list(org.springframework.security.core.Authentication authentication) {
      if (authentication == null) throw COSError.forbidden();
      return modules.list(COSActor.from(authentication, properties));
    }
  }
}
