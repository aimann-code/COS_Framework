package com.cos.shared.commerce;

import static com.cos.shared.commerce.CommerceContracts.*;

import com.cos.shared.COSError;
import com.cos.shared.COSJson;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CommerceRepository {
  public record CompanyRow(
      UUID id,
      String reference,
      String name,
      String email,
      String scope,
      String status,
      List<ServiceView> snapshot,
      long total,
      String currency,
      String billing,
      String tokenDigest,
      Instant tokenExpires) {}

  public record ConfigRow(
      UUID id,
      UUID company,
      String scope,
      String service,
      FieldInput field,
      String submittedBy,
      String status,
      int baseVersion,
      String kind,
      int baseSchemaVersion) {}

  private final JdbcClient jdbc;
  private final COSJson json;

  public CommerceRepository(JdbcClient jdbc, COSJson json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public List<ServiceView> catalog() {
    return jdbc.sql("SELECT * FROM commerce.service_descriptor ORDER BY service_code")
        .query(
            (r, n) ->
                new ServiceView(
                    r.getString("service_code"),
                    r.getString("name"),
                    r.getString("suite"),
                    r.getString("engine"),
                    r.getString("description"),
                    r.getLong("price_minor"),
                    r.getString("currency"),
                    r.getString("billing_period"),
                    r.getBoolean("active"),
                    false,
                    strings(r.getString("module_codes")),
                    strings(r.getString("dependencies")),
                    r.getInt("version")))
        .list();
  }

  public void insertCompany(
      UUID id, String reference, List<ServiceView> snapshot, long total, String digest) {
    jdbc.sql(
            "INSERT INTO"
                + " commerce.company(company_id,reference,service_snapshot,total_minor,token_digest)"
                + " VALUES(:id,:reference,CAST(:snapshot AS jsonb),:total,:digest)")
        .param("id", id)
        .param("reference", reference)
        .param("snapshot", json.write(snapshot))
        .param("total", total)
        .param("digest", digest)
        .update();
  }

  public CompanyRow company(UUID id, boolean lock) {
    return jdbc.sql(
            "SELECT c.*,r.company_name,r.login_email FROM commerce.company c"
                + " JOIN auth.company_request r ON r.request_id=c.company_id WHERE c.company_id=:id"
                + (lock ? " FOR UPDATE OF c" : ""))
        .param("id", id)
        .query((r, n) -> companyRow(r))
        .optional()
        .orElseThrow(COSError::missing);
  }

  public CompanyRow companyByScope(String scope) {
    return jdbc.sql(
            "SELECT c.*,r.company_name,r.login_email FROM commerce.company c JOIN"
                + " auth.company_request r ON r.request_id=c.company_id WHERE c.scope_id=:scope")
        .param("scope", scope)
        .query((r, n) -> companyRow(r))
        .optional()
        .orElseThrow(COSError::missing);
  }

  private CompanyRow companyRow(ResultSet r) throws SQLException {
    return new CompanyRow(
        r.getObject("company_id", UUID.class),
        r.getString("reference"),
        r.getString("company_name"),
        r.getString("login_email"),
        r.getString("scope_id"),
        r.getString("status"),
        Arrays.asList(json.read(r.getString("service_snapshot"), ServiceView[].class)),
        r.getLong("total_minor"),
        r.getString("currency"),
        r.getString("billing_period"),
        r.getString("token_digest"),
        r.getTimestamp("token_expires_at").toInstant());
  }

  public void declarePayment(UUID id, UUID company, String reference, long total) {
    jdbc.sql(
            "INSERT INTO"
                + " commerce.payment(payment_id,company_id,payment_reference,total_minor,currency)"
                + " VALUES(:id,:company,:reference,:total,'INR')")
        .param("id", id)
        .param("company", company)
        .param("reference", reference)
        .param("total", total)
        .update();
    jdbc.sql("UPDATE commerce.company SET status='PAYMENT_REVIEW' WHERE company_id=:id")
        .param("id", company)
        .update();
  }

  public PaymentView payment(UUID id, boolean lock) {
    return jdbc.sql(
            "SELECT p.*,r.company_name,c.reference FROM commerce.payment p"
                + " JOIN commerce.company c ON c.company_id=p.company_id"
                + " JOIN auth.company_request r ON r.request_id=p.company_id WHERE p.payment_id=:id"
                + (lock ? " FOR UPDATE OF p" : ""))
        .param("id", id)
        .query((r, n) -> paymentView(r))
        .optional()
        .orElseThrow(COSError::missing);
  }

  public List<PaymentView> companyPayments(UUID id) {
    return jdbc.sql(
            "SELECT p.*,r.company_name,c.reference FROM commerce.payment p"
                + " JOIN commerce.company c ON c.company_id=p.company_id"
                + " JOIN auth.company_request r ON r.request_id=p.company_id WHERE p.company_id=:id"
                + " ORDER BY p.created_at DESC LIMIT 200")
        .param("id", id)
        .query((r, n) -> paymentView(r))
        .list();
  }

  private PaymentView paymentView(ResultSet r) throws SQLException {
    return new PaymentView(
        r.getObject("payment_id", UUID.class).toString(),
        r.getObject("company_id", UUID.class).toString(),
        r.getString("company_name"),
        r.getString("reference"),
        r.getString("payment_reference"),
        r.getLong("total_minor"),
        r.getString("currency"),
        r.getString("status"),
        r.getString("remarks"),
        r.getTimestamp("created_at").toInstant().toString());
  }

  public void reviewPayment(UUID id, String status, String actor, String remarks) {
    jdbc.sql(
            "UPDATE commerce.payment SET status=:status,reviewed_by=:actor,remarks=:remarks,"
                + "reviewed_at=now() WHERE payment_id=:id AND status='PENDING_REVIEW'")
        .param("id", id)
        .param("status", status)
        .param("actor", actor)
        .param("remarks", remarks)
        .update();
  }

  public void rejectPayment(UUID company) {
    jdbc.sql("UPDATE commerce.company SET status='PAYMENT_REJECTED' WHERE company_id=:id")
        .param("id", company)
        .update();
  }

  public void activate(UUID company, UUID payment, List<ServiceView> snapshot) {
    String scope =
        jdbc.sql("SELECT scope_id FROM auth.company_request WHERE request_id=:id")
            .param("id", company)
            .query(String.class)
            .single();
    jdbc.sql(
            "UPDATE commerce.company SET status='ACTIVE',scope_id=:scope,activated_at=now()"
                + " WHERE company_id=:id")
        .param("scope", scope)
        .param("id", company)
        .update();
    jdbc.sql(
            "UPDATE meta.scope SET label=(SELECT company_name FROM auth.company_request WHERE"
                + " request_id=:id) WHERE scope_id=:scope")
        .param("id", company)
        .param("scope", scope)
        .update();
    for (ServiceView service : snapshot) {
      jdbc.sql(
              "INSERT INTO commerce.entitlement(company_id,scope_id,service_code,payment_id)"
                  + " VALUES(:company,:scope,:service,:payment)")
          .param("company", company)
          .param("scope", scope)
          .param("service", service.service_code())
          .param("payment", payment)
          .update();
      jdbc.sql("INSERT INTO commerce.service_schema(scope_id,service_code) VALUES(:scope,:service)")
          .param("scope", scope)
          .param("service", service.service_code())
          .update();
    }
  }

  public CompanyView companyView(UUID id) {
    return companyViews("WHERE c.company_id=:id", id).getFirst();
  }

  public List<CompanyView> companies() {
    return companyViews("ORDER BY c.created_at DESC LIMIT 200", null);
  }

  private List<CompanyView> companyViews(String suffix, UUID id) {
    var statement =
        jdbc.sql(
            "SELECT c.*,r.company_name,r.login_email, (SELECT count(*) FROM"
                + " commerce.configuration_request q WHERE q.company_id=c.company_id AND"
                + " q.status='PENDING_REVIEW') pending_configs, (SELECT"
                + " COALESCE(jsonb_agg(e.service_code ORDER BY e.service_code),'[]'::jsonb) FROM"
                + " commerce.entitlement e WHERE e.company_id=c.company_id AND e.state='ACTIVE')"
                + " active_services FROM commerce.company c JOIN auth.company_request r ON"
                + " r.request_id=c.company_id "
                + suffix);
    if (id != null) statement.param("id", id);
    return statement
        .query(
            (r, n) ->
                new CompanyView(
                    r.getObject("company_id", UUID.class).toString(),
                    r.getString("reference"),
                    r.getString("company_name"),
                    r.getString("login_email"),
                    r.getString("scope_id"),
                    r.getString("status"),
                    Arrays.stream(json.read(r.getString("service_snapshot"), ServiceView[].class))
                        .map(ServiceView::service_code)
                        .toList(),
                    strings(r.getString("active_services")),
                    r.getLong("total_minor"),
                    r.getString("currency"),
                    r.getTimestamp("created_at").toInstant().toString(),
                    r.getLong("pending_configs")))
        .list();
  }

  public Counts counts() {
    return jdbc.sql(
            "SELECT (SELECT count(*) FROM commerce.company) companies, (SELECT count(*) FROM"
                + " commerce.company WHERE status='ACTIVE') active, (SELECT count(*) FROM"
                + " commerce.payment WHERE status='PENDING_REVIEW') payments, (SELECT count(*) FROM"
                + " commerce.configuration_request WHERE status='PENDING_REVIEW') configs")
        .query(
            (r, n) ->
                new Counts(
                    r.getLong("companies"),
                    r.getLong("active"),
                    r.getLong("payments"),
                    r.getLong("configs")))
        .single();
  }

  public List<PaymentView> payments() {
    return jdbc.sql(
            "SELECT p.*,r.company_name,c.reference FROM commerce.payment p"
                + " JOIN commerce.company c ON c.company_id=p.company_id"
                + " JOIN auth.company_request r ON r.request_id=p.company_id"
                + " ORDER BY (p.status='PENDING_REVIEW') DESC,p.created_at DESC LIMIT 200")
        .query((r, n) -> paymentView(r))
        .list();
  }

  public boolean entitled(String scope, String service) {
    return jdbc.sql(
                "SELECT count(*) FROM commerce.entitlement WHERE scope_id=:scope"
                    + " AND service_code=:service AND state='ACTIVE'")
            .param("scope", scope)
            .param("service", service)
            .query(Long.class)
            .single()
        > 0;
  }

  public void insertConfiguration(
      UUID id,
      CompanyRow company,
      ConfigurationSubmit input,
      String actor,
      int baseVersion,
      int schemaVersion) {
    jdbc.sql(
            "INSERT INTO"
                + " commerce.configuration_request(request_id,company_id,scope_id,service_code,kind,payload,reason,submitted_by,base_config_version,base_schema_version)"
                + " VALUES(:id,:company,:scope,:service,:kind,CAST(:payload AS"
                + " jsonb),:reason,:actor,:version,:schemaVersion)")
        .param("id", id)
        .param("company", company.id())
        .param("scope", company.scope())
        .param("service", input.service_code())
        .param("payload", json.write(input.field()))
        .param("reason", input.reason().strip())
        .param("actor", actor)
        .param("version", baseVersion)
        .param("kind", input.kind())
        .param("schemaVersion", schemaVersion)
        .update();
  }

  public ConfigRow configuration(UUID id, boolean lock) {
    return jdbc.sql(
            "SELECT * FROM commerce.configuration_request WHERE request_id=:id"
                + (lock ? " FOR UPDATE" : ""))
        .param("id", id)
        .query(
            (r, n) ->
                new ConfigRow(
                    id,
                    r.getObject("company_id", UUID.class),
                    r.getString("scope_id"),
                    r.getString("service_code"),
                    json.read(r.getString("payload"), FieldInput.class),
                    r.getString("submitted_by"),
                    r.getString("status"),
                    r.getInt("base_config_version"),
                    r.getString("kind"),
                    r.getInt("base_schema_version")))
        .optional()
        .orElseThrow(COSError::missing);
  }

  public List<ConfigurationView> configurations(UUID company) {
    var statement =
        jdbc.sql(
            "SELECT q.*,r.company_name,s.name service_name FROM commerce.configuration_request q"
                + " JOIN auth.company_request r ON r.request_id=q.company_id"
                + " JOIN commerce.service_descriptor s ON s.service_code=q.service_code"
                + (company == null ? "" : " WHERE q.company_id=:company")
                + " ORDER BY (q.status='PENDING_REVIEW') DESC,q.created_at DESC LIMIT 200");
    if (company != null) statement.param("company", company);
    return statement
        .query(
            (r, n) ->
                new ConfigurationView(
                    r.getObject("request_id", UUID.class).toString(),
                    r.getObject("company_id", UUID.class).toString(),
                    r.getString("company_name"),
                    r.getString("scope_id"),
                    r.getString("service_code"),
                    r.getString("service_name"),
                    r.getString("kind"),
                    json.read(r.getString("payload"), FieldInput.class),
                    r.getString("reason"),
                    r.getString("status"),
                    r.getString("remarks"),
                    r.getInt("version"),
                    r.getTimestamp("created_at").toInstant().toString(),
                    r.getInt("base_schema_version")))
        .list();
  }

  public void reviewConfiguration(UUID id, String status, String actor, String remarks) {
    jdbc.sql(
            "UPDATE commerce.configuration_request SET"
                + " status=:status,reviewed_by=:actor,remarks=:remarks,version=version+1,reviewed_at=now()"
                + " WHERE request_id=:id AND status='PENDING_REVIEW'")
        .param("id", id)
        .param("status", status)
        .param("actor", actor)
        .param("remarks", remarks)
        .update();
  }

  public void mapField(ConfigRow request, String fieldId) {
    jdbc.sql(
            "INSERT INTO"
                + " commerce.service_field(scope_id,service_code,field_id,configuration_request_id,configuration)"
                + " VALUES(:scope,:service,:field,:request,CAST(:configuration AS jsonb))")
        .param("scope", request.scope())
        .param("service", request.service())
        .param("field", UUID.fromString(fieldId))
        .param("request", request.id())
        .param("configuration", json.write(request.field()))
        .update();
  }

  public List<FieldInput> schema(String scope, String service) {
    return jdbc.sql(
            "SELECT s.configuration || jsonb_build_object('sensitive',"
                + " COALESCE((s.configuration->>'sensitive')::boolean,false) OR f.sensitive) FROM"
                + " commerce.service_field s JOIN meta.field_definition f ON f.field_id=s.field_id"
                + " WHERE s.scope_id=:scope AND s.service_code=:service ORDER BY"
                + " s.created_at,f.technical_name")
        .param("scope", scope)
        .param("service", service)
        .query((r, n) -> json.read(r.getString(1), FieldInput.class))
        .list();
  }

  public int schemaVersion(String scope, String service) {
    return jdbc.sql(
            "SELECT version FROM commerce.service_schema WHERE scope_id=:scope AND"
                + " service_code=:service")
        .param("scope", scope)
        .param("service", service)
        .query(Integer.class)
        .optional()
        .orElse(1);
  }

  public void advanceSchema(String scope, String service) {
    jdbc.sql(
            "UPDATE commerce.service_schema SET version=version+1 WHERE scope_id=:scope AND"
                + " service_code=:service")
        .param("scope", scope)
        .param("service", service)
        .update();
  }

  public void updateField(ConfigRow request) {
    int changed =
        jdbc.sql(
                "UPDATE commerce.service_field s SET configuration=CAST(:configuration AS"
                    + " jsonb),configuration_request_id=:request FROM meta.field_definition f WHERE"
                    + " f.field_id=s.field_id AND s.scope_id=:scope AND s.service_code=:service AND"
                    + " f.technical_name=:name")
            .param("configuration", json.write(request.field()))
            .param("request", request.id())
            .param("scope", request.scope())
            .param("service", request.service())
            .param("name", request.field().technical_name())
            .update();
    if (changed != 1)
      throw COSError.conflict("FIELD_NOT_CONFIGURED", "Choose an existing service field.");
    // Sensitivity is shared and monotonic, even if different service labels are configured.
    if (request.field().sensitive())
      jdbc.sql(
              "UPDATE meta.field_definition SET sensitive=true WHERE scope_id=:scope AND"
                  + " technical_name=:name")
          .param("scope", request.scope())
          .param("name", request.field().technical_name())
          .update();
  }

  public void event(UUID company, String type, String actor, Object payload) {
    jdbc.sql(
            "INSERT INTO commerce.event(event_id,company_id,event_type,actor_id,payload)"
                + " VALUES(:id,:company,:type,:actor,CAST(:payload AS jsonb))")
        .param("id", UUID.randomUUID())
        .param("company", company)
        .param("type", type)
        .param("actor", actor)
        .param("payload", json.write(payload))
        .update();
  }

  public boolean updateCatalog(String code, CatalogUpdate input) {
    return jdbc.sql(
                "UPDATE commerce.service_descriptor SET"
                    + " description=:description,price_minor=:price,active=:active,version=version+1"
                    + " WHERE service_code=:code AND version=:version")
            .param("description", input.description().strip())
            .param("price", input.price_minor())
            .param("active", input.active())
            .param("code", code)
            .param("version", input.version())
            .update()
        == 1;
  }

  private List<String> strings(String value) {
    return Arrays.asList(json.read(value, String[].class));
  }
}
