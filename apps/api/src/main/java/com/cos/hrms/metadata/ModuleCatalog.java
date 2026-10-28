package com.cos.hrms.metadata;

import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.COSError;
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

    public ModuleService(ModuleRepository repository) {
      this.repository = repository;
    }

    @Transactional
    public void ensure(String scope) {
      repository.ensure(scope, "EMPLOYEES", "Employee records", "/people", "REGISTRAR,EMPLOYEE");
      repository.ensure(scope, "LEAVE", "Leave", "/people/leave", "REGISTRAR,EMPLOYEE,ADMIN");
      repository.ensure(scope, "LEAVE_POLICY", "Leave policy", "/people/leave/policies", "REGISTRAR,ADMIN");
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
    private final com.cos.hrms.config.COSProperties properties;

    public ModuleController(ModuleService modules, com.cos.hrms.config.COSProperties properties) {
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
