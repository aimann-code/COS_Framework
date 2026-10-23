package com.cos.hrms.onboarding;

import static com.cos.hrms.onboarding.EmpUniqueKeyContracts.*;
import com.cos.hrms.metadata.COSMetadataRepository;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.*;
import com.cos.shared.reg.UniqueKeyRule;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmpUniqueKeyService {
  private static final Map<String,String> DEFAULTS=Map.of(
      "UNIQUE_KEY_MISSING","Cannot continue: required unique-key fields are missing: {fields}. Source: {source}.",
      "UNIQUE_KEY_NOT_FOUND","No employee matches the supplied {fields} combination. Source: {source}.",
      "UNIQUE_KEY_DUPLICATE","This unique-key combination conflicts with an existing employee. Source: {source}.",
      "UNIQUE_KEY_ACTIVATION_FAILED","Existing records are incomplete or duplicated for {fields}. Source: {source}.");
  private final EmpUniqueKeyRepo keys;
  private final COSMetadataRepository configs;
  private final OnboardingRepository employees;
  private final COSCrypto crypto;
  private final COSJson json;
  private final COSAuditService audit;

  public EmpUniqueKeyService(EmpUniqueKeyRepo keys,COSMetadataRepository configs,
      OnboardingRepository employees,COSCrypto crypto,COSJson json,COSAuditService audit) {
    this.keys=keys; this.configs=configs; this.employees=employees;
    this.crypto=crypto; this.json=json; this.audit=audit;
  }

  @Transactional(readOnly=true)
  public RuleResDTO read(COSActor actor) {
    requireConfigAccess(actor,false);
    var stored=required(actor.scope());
    return new RuleResDTO(stored.rule().version(),stored.rule().fields(),stored.messages());
  }

  @Transactional
  public RuleResDTO activate(COSActor actor,ActivateReqDTO input) {
    requireConfigAccess(actor,true);
    if (!input.confirmed()) throw new COSError(422,"CONFIRMATION_REQUIRED","Confirm the configuration change.");
    configs.lock(actor.scope()); // Shared with every employee mutation; serializes activation and writes.
    int previous=keys.active(actor.scope()).map(s->s.rule().version()).orElse(0);
    if(previous!=input.expectedVersion())
      throw COSError.conflict("UNIQUE_CONFIG_STALE","The active rule changed. Reload before confirming.");
    UniqueKeyRule rule;
    try { rule=new UniqueKeyRule(previous+1,input.fields()); }
    catch(IllegalArgumentException e) { throw new COSError(422,"UNIQUE_RULE_INVALID",e.getMessage()); }
    var metadata=configs.active(actor.scope()).metadata();
    for(var field:rule.fields()) {
      boolean allowed=OnboardingValidation.isCore(field.name())
          || metadata.fields().stream().anyMatch(f->f.id().equals(field.name()) && f.visible());
      if(!allowed) throw new COSError(422,"UNIQUE_FIELD_INVALID","Select a registered enabled scalar field.");
    }
    var messages=validateMessages(input.messages());
    var stored=new EmpUniqueKeyRepo.Stored(rule,messages);
    var tokens=new HashMap<String,UUID>();
    // Existing encrypted profiles never leave the server; no raw key values in messages/audit.
    for(var employee:employees.allEmployees(actor.scope())) {
      var profile=json.read(crypto.decrypt(employee.encrypted(),
          OnboardingService.profileContext(actor.scope(),employee.id())),OnboardingContracts.Profile.class);
      if(!rule.missing(profile.values()).isEmpty())
        throw failure(stored,"UNIQUE_KEY_ACTIVATION_FAILED",rule.missing(profile.values()),
            "employee/"+employee.id(),409);
      String token=token(actor.scope(),rule,profile.values());
      if(tokens.putIfAbsent(token,employee.id())!=null)
        throw failure(stored,"UNIQUE_KEY_ACTIVATION_FAILED",names(rule),"employee/"+employee.id(),409);
    }
    keys.insertRule(actor.scope(),actor.id(),rule,messages);
    for(var entry:tokens.entrySet())
      if(!keys.claim(actor.scope(),rule.version(),entry.getKey(),entry.getValue()))
        throw failure(stored,"UNIQUE_KEY_ACTIVATION_FAILED",names(rule),"configuration",409);
    keys.activate(actor.scope(),rule.version());
    audit.record(actor.scope(),actor.id(),null,"ACTIVATE_EMP_UNIQUE_KEY",
        Integer.toString(rule.version()),"CONFIRMED");
    return new RuleResDTO(rule.version(),rule.fields(),messages);
  }

  /** Called inside the existing scope-locked domain transaction before a final write. */
  public void checkCreate(String scope,Map<String,String> values,String source) {
    var s=required(scope); String token=checkedToken(scope,s,values,source);
    if(keys.match(scope,s.rule().version(),token).isPresent())
      throw failure(s,"UNIQUE_KEY_DUPLICATE",names(s.rule()),source,409);
  }

  /** Current increment deliberately blocks changes to matching fields; controlled old/new-key DTO follows. */
  public void checkUpdate(String scope,Map<String,String> values,UUID expected,String source) {
    var s=required(scope); String token=checkedToken(scope,s,values,source);
    var match=keys.match(scope,s.rule().version(),token);
    if(match.isEmpty())
      throw failure(s,"UNIQUE_KEY_NOT_FOUND",names(s.rule()),source,422);
    if(!match.get().equals(expected))
      throw failure(s,"UNIQUE_KEY_DUPLICATE",names(s.rule()),source,409);
  }

  public void claimCreated(String scope,Map<String,String> values,UUID employee,String source) {
    var s=required(scope); String token=checkedToken(scope,s,values,source);
    if(!keys.claim(scope,s.rule().version(),token,employee))
      throw failure(s,"UNIQUE_KEY_DUPLICATE",names(s.rule()),source,409);
  }

  private String checkedToken(String scope,EmpUniqueKeyRepo.Stored s,Map<String,String> values,String source) {
    var missing=s.rule().missing(values);
    if(!missing.isEmpty()) throw failure(s,"UNIQUE_KEY_MISSING",missing,source,422);
    try { return token(scope,s.rule(),values); }
    catch(IllegalArgumentException e) {
      throw new COSError(422,"UNIQUE_VALUE_INVALID","The unique key contains an invalid value.");
    }
  }

  private String token(String scope,UniqueKeyRule rule,Map<String,String> values) {
    // keyedHash preserves the explicitly configured EXACT/TRIM/CASE_FOLD semantics.
    return crypto.keyedHash(json.write(List.of(scope,"emp_reg",rule.version(),rule.canonical(values))));
  }

  private EmpUniqueKeyRepo.Stored required(String scope) {
    return keys.active(scope).orElseThrow(()->new COSError(409,"UNIQUE_RULE_REQUIRED",
        "An entity administrator must activate a composite unique key before employee writes."));
  }

  private void requireConfigAccess(COSActor actor,boolean write) {
    if(!keys.permitted(actor.scope(),actor.id(),write)) throw COSError.forbidden();
  }

  private List<String> names(UniqueKeyRule rule) { return rule.fields().stream().map(UniqueKeyRule.Field::name).toList(); }

  private Map<String,String> validateMessages(Map<String,String> supplied) {
    if(supplied==null || supplied.size()>DEFAULTS.size())
      throw new COSError(422,"ERROR_TEMPLATE_INVALID","Use supported message codes.");
    var out=new HashMap<>(DEFAULTS);
    for(var e:supplied.entrySet()) {
      if(!DEFAULTS.containsKey(e.getKey()) || e.getValue()==null || e.getValue().isBlank()
          || e.getValue().length()>600)
        throw new COSError(422,"ERROR_TEMPLATE_INVALID","Use bounded supported error templates.");
      String remaining=e.getValue().replace("{fields}","").replace("{source}","");
      if(remaining.contains("{") || remaining.contains("}"))
        throw new COSError(422,"ERROR_TEMPLATE_INVALID","Supported placeholders: {fields}, {source}.");
      out.put(e.getKey(),e.getValue());
    }
    return Map.copyOf(out);
  }

  private COSError failure(EmpUniqueKeyRepo.Stored s,String code,List<String> fields,String source,int status) {
    var details=new LinkedHashMap<String,String>();
    fields.forEach(f->details.put(f,code.equals("UNIQUE_KEY_MISSING")?"Required unique-key field.":"Check the configured key combination."));
    details.put("source_ref",source);
    String template=s.messages().getOrDefault(code,DEFAULTS.get(code));
    String message=template.replace("{fields}",String.join(", ",fields)).replace("{source}",source);
    return new COSError(status,code,message,details);
  }
}
