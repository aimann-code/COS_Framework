package com.cos.shared.registry;

import com.cos.shared.COSAuditService;
import com.cos.shared.COSError;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.security.COSActor;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** External ids for one employee. Called by PlatformController identity-link routes. */
@Service
public class IdentityLinkService {
  private final JdbcClient jdbc;
  private final COSMetadataRepository configs;
  private final COSAuditService audit;

  public IdentityLinkService(JdbcClient jdbc, COSMetadataRepository configs, COSAuditService audit) {
    this.jdbc = jdbc;
    this.configs = configs;
    this.audit = audit;
  }

  public record LinkWrite(
      UUID employee_id,
      String system_code,
      String external_id,
      String external_name,
      LocalDate valid_from,
      LocalDate valid_to) {}

  public record CloseLink(LocalDate valid_to) {}

  public record LinkView(
      String link_id,
      String employee_id,
      String system_code,
      String external_id,
      String external_name,
      LocalDate valid_from,
      LocalDate valid_to) {}

  @Transactional(readOnly = true)
  public List<LinkView> list(COSActor actor, UUID employee) {
    FieldRegistryService.read(actor);
    requireEmployee(actor.scope(), employee);
    return links(actor.scope(), employee);
  }

  @Transactional
  public LinkView link(COSActor actor, LinkWrite input) {
    FieldRegistryService.read(actor);
    configs.lock(actor.scope());
    if (input == null || input.employee_id() == null)
      throw new COSError(422, "IDENTITY_INVALID", "Name the employee for this external id.");
    requireEmployee(actor.scope(), input.employee_id());
    String system = system(input.system_code());
    String external = external(input.external_id());
    String name = name(input.external_name());
    if (input.valid_from() == null)
      throw new COSError(422, "IDENTITY_INVALID", "Provide the date this external id starts.");
    if (input.valid_to() != null && input.valid_to().isBefore(input.valid_from()))
      throw new COSError(422, "IDENTITY_INVALID", "The end date must be on or after the start date.");
    for (LinkView link : links(actor.scope(), input.employee_id())) {
      if (link.system_code().equals(system)
          && overlaps(input.valid_from(), input.valid_to(), link.valid_from(), link.valid_to()))
        throw COSError.conflict(
            "IDENTITY_OVERLAP",
            "This external id overlaps an existing period for the same system.");
    }
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO people.identity_link(link_id,readable_id,scope_id,employee_id,system_code,"
                + "external_id,external_name,valid_from,valid_to,created_by) VALUES(:id,:readable,"
                + ":scope,:employee,:system,:external,:name,:from,:to,:actor)")
        .param("id", id)
        .param("readable", "LOCAL-IDL-" + id)
        .param("scope", actor.scope())
        .param("employee", input.employee_id())
        .param("system", system)
        .param("external", external)
        .param("name", name)
        .param("from", input.valid_from())
        .param("to", input.valid_to())
        .param("actor", actor.id())
        .update();
    audit.record(actor.scope(), actor.id(), null, "IDENTITY_LINKED", id.toString(), "COMPLETED");
    return one(actor.scope(), input.employee_id(), id);
  }

  @Transactional
  public LinkView close(COSActor actor, UUID link, CloseLink input) {
    FieldRegistryService.read(actor);
    configs.lock(actor.scope());
    if (input == null || input.valid_to() == null)
      throw new COSError(422, "IDENTITY_INVALID", "Provide the date this external id ends.");
    var current =
        jdbc.sql(
                "SELECT employee_id,valid_from,valid_to FROM people.identity_link WHERE scope_id=:scope"
                    + " AND link_id=:id")
            .param("scope", actor.scope())
            .param("id", link)
            .query(
                (r, n) ->
                    new Span(
                        r.getObject(1, UUID.class),
                        r.getDate(2).toLocalDate(),
                        r.getDate(3) == null ? null : r.getDate(3).toLocalDate()))
            .optional()
            .orElseThrow(COSError::missing);
    if (current.validTo() != null)
      throw COSError.conflict("IDENTITY_CLOSED", "This external id period is already closed.");
    if (input.valid_to().isBefore(current.validFrom()))
      throw new COSError(422, "IDENTITY_INVALID", "The end date must be on or after the start date.");
    jdbc.sql(
            "UPDATE people.identity_link SET valid_to=:to WHERE scope_id=:scope AND link_id=:id AND"
                + " valid_to IS NULL")
        .param("to", input.valid_to())
        .param("scope", actor.scope())
        .param("id", link)
        .update();
    audit.record(actor.scope(), actor.id(), null, "IDENTITY_CLOSED", link.toString(), "COMPLETED");
    return one(actor.scope(), current.employee(), link);
  }

  private LinkView one(String scope, UUID employee, UUID link) {
    return links(scope, employee).stream()
        .filter(row -> row.link_id().equals(link.toString()))
        .findFirst()
        .orElseThrow(COSError::missing);
  }

  private List<LinkView> links(String scope, UUID employee) {
    return jdbc.sql(
            "SELECT link_id,employee_id,system_code,external_id,external_name,valid_from,valid_to"
                + " FROM people.identity_link WHERE scope_id=:scope AND employee_id=:employee ORDER"
                + " BY system_code,valid_from")
        .param("scope", scope)
        .param("employee", employee)
        .query(
            (r, n) ->
                new LinkView(
                    r.getObject(1, UUID.class).toString(),
                    r.getObject(2, UUID.class).toString(),
                    r.getString(3),
                    r.getString(4),
                    r.getString(5),
                    r.getDate(6).toLocalDate(),
                    r.getDate(7) == null ? null : r.getDate(7).toLocalDate()))
        .list();
  }

  private void requireEmployee(String scope, UUID employee) {
    Long count =
        jdbc.sql("SELECT count(*) FROM people.employee WHERE scope_id=:scope AND employee_id=:id")
            .param("scope", scope)
            .param("id", employee)
            .query(Long.class)
            .single();
    if (count == null || count == 0) throw COSError.missing();
  }

  private static boolean overlaps(
      LocalDate from, LocalDate to, LocalDate otherFrom, LocalDate otherTo) {
    LocalDate end = to == null ? LocalDate.MAX : to;
    LocalDate otherEnd = otherTo == null ? LocalDate.MAX : otherTo;
    return !from.isAfter(otherEnd) && !otherFrom.isAfter(end);
  }

  private static String system(String value) {
    if (value == null || !Set.of("SYS", "RZP", "ATTENDO").contains(value))
      throw new COSError(422, "IDENTITY_INVALID", "Use SYS, RZP, or ATTENDO.");
    return value;
  }

  private static String external(String value) {
    if (value == null || value.isBlank() || value.trim().length() > 64)
      throw new COSError(422, "IDENTITY_INVALID", "Provide an external id of at most 64 characters.");
    return value.trim();
  }

  private static String name(String value) {
    if (value == null || value.isBlank()) return null;
    if (value.trim().length() > 160)
      throw new COSError(422, "IDENTITY_INVALID", "The external name must be at most 160 characters.");
    return value.trim();
  }

  private record Span(UUID employee, LocalDate validFrom, LocalDate validTo) {}
}
