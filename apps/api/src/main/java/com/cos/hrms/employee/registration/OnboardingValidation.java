package com.cos.hrms.employee.registration;

import static com.cos.hrms.employee.registration.OnboardingContracts.*;

import com.cos.hrms.metadata.COSMetadataRepository;
import com.cos.hrms.shared.COSError;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class OnboardingValidation {
  public static final Set<String> SENSITIVE =
      Set.of("aadhaar", "pan", "uan", "esic", "section197", "account_number");
  public static final Set<String> EMPLOYMENT =
      Set.of("joiner", "joining", "previous_id", "basic_salary", "room", "travel", "pay_currency");
  private static final Set<String> BASE =
      Set.of(
          "name",
          "dob",
          "nationality",
          "blood",
          "marital",
          "email",
          "joiner",
          "joining",
          "previous_id",
          "basic_salary",
          "room",
          "travel",
          "pay_currency",
          "beneficiary",
          "beneficiary_relationship",
          "bank",
          "branch",
          "branch_address",
          "account_type",
          "account_number",
          "ifsc",
          "aadhaar",
          "pan",
          "uan",
          "esic",
          "section197",
          "work_email_mode",
          "work_email_existing",
          "phone",
          "whatsapp",
          "telegram",
          "father",
          "father_dob",
          "mother",
          "mother_dob",
          "spouse",
          "spouse_dob",
          "anniversary",
          "qualification",
          "experience",
          "tshirt",
          "shirt",
          "chef",
          "waist",
          "pant",
          "shoe");
  private static final Set<String> DATES =
      Set.of("dob", "joining", "father_dob", "mother_dob", "spouse_dob", "anniversary");
  private static final Set<String> MONEY = Set.of("basic_salary", "room", "travel");
  private static final Map<String, List<String>> CHOICES =
      Map.of(
          "joiner",
          List.of("New joiner", "Rejoiner"),
          "blood",
          List.of("A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"),
          "marital",
          List.of("Single", "Married", "Other", "Prefer not to say"),
          "beneficiary_relationship",
          List.of("Self", "Spouse", "Parent", "Other"),
          "account_type",
          List.of("Savings", "Current", "Other"),
          "pay_currency",
          List.of("INR"),
          "tshirt",
          List.of("XS", "S", "M", "L", "XL", "XXL", "Other"),
          "work_email_mode",
          List.of("generate", "existing"));
  private static final Map<String, Set<String>> GROUPS =
      Map.of(
          "allowances",
          Set.of("name", "amount"),
          "emergency",
          Set.of("name", "relationship", "phone", "context"),
          "children",
          Set.of("name", "dob"),
          "employers",
          Set.of("name", "designation"));

  public static boolean isCore(String key) {
    return BASE.contains(key);
  }

  public Profile parse(tools.jackson.databind.JsonNode node) {
    if (node == null
        || !node.isObject()
        || !node.path("values").isObject()
        || !node.path("groups").isObject()
        || !node.path("same_address").isBoolean())
      throw invalid("profile", "Provide values, groups and a same-address flag.");
    node.properties()
        .forEach(
            e -> {
              if (!Set.of("values", "groups", "same_address").contains(e.getKey()))
                throw invalid("profile", "Unknown profile property.");
            });
    var values = new LinkedHashMap<String, String>();
    node.get("values")
        .properties()
        .forEach(
            e -> {
              if (!e.getValue().isString())
                throw invalid(
                    e.getKey(),
                    "Profile values must be text. Preserve identifiers and leading zeros.");
              values.put(e.getKey(), e.getValue().asText());
            });
    var groups = new LinkedHashMap<String, List<Entry>>();
    node.get("groups")
        .properties()
        .forEach(
            g -> {
              if (!g.getValue().isArray() || g.getValue().size() > 20)
                throw invalid("groups", "Provide at most 20 entries per section.");
              var entries = new ArrayList<Entry>();
              for (var entry : g.getValue()) {
                if (!entry.isObject()
                    || !entry.path("id").isString()
                    || !entry.path("values").isObject())
                  throw invalid("groups", "Provide an entry reference and text values.");
                entry
                    .properties()
                    .forEach(
                        e -> {
                          if (!Set.of("id", "values").contains(e.getKey()))
                            throw invalid("groups", "Unknown entry property.");
                        });
                var row = new LinkedHashMap<String, String>();
                entry
                    .get("values")
                    .properties()
                    .forEach(
                        e -> {
                          if (!e.getValue().isString())
                            throw invalid(g.getKey(), "Repeated field values must be text.");
                          row.put(e.getKey(), e.getValue().asText());
                        });
                entries.add(new Entry(entry.get("id").asText(), row));
              }
              groups.put(g.getKey(), entries);
            });
    return new Profile(values, groups, node.get("same_address").asBoolean());
  }

  public Profile clean(Profile input, boolean complete, COSMetadataRepository.Config config) {
    if (input == null
        || input.values() == null
        || input.groups() == null
        || input.values().size() > 170
        || input.groups().size() > 4)
      throw invalid("profile", "Provide a bounded employee profile.");
    var allowed = new HashSet<>(BASE);
    for (String prefix : List.of("permanent_", "local_"))
      for (String key :
          List.of("house", "street", "area", "landmark", "city", "state", "country", "postal"))
        allowed.add(prefix + key);
    var custom = new HashMap<String, com.cos.hrms.web.COSContracts.Field>();
    for (var f : config.metadata().fields()) {
      if (!allowed.contains(f.id())) {
        allowed.add(f.id());
        custom.put(f.id(), f);
      }
    }
    var values = new LinkedHashMap<String, String>();
    for (var e : input.values().entrySet()) {
      String key = e.getKey(), v = e.getValue();
      if (!allowed.contains(key) || v == null)
        throw invalid(key, "Unknown field or invalid text value.");
      v = v.strip();
      if (v.length()
              > (custom.containsKey(key)
                  ? custom.get(key).max_length() == null ? 500 : custom.get(key).max_length()
                  : key.endsWith("address") ? 500 : 254)
          || v.chars().anyMatch(c -> c < 32 && c != '\n' && c != '\t'))
        throw invalid(key, "The value is too long or contains unsupported characters.");
      if (v.startsWith("•"))
        throw invalid(key, "Masked values cannot be used as replacement information.");
      if (key.equals("pan") || key.equals("ifsc")) v = v.toUpperCase(Locale.ROOT);
      if (!v.isEmpty()) {
        if (CHOICES.containsKey(key) && !CHOICES.get(key).contains(v))
          throw invalid(key, "Choose a configured option.");
        if (DATES.contains(key)) date(key, v, !key.equals("joining"));
        if (MONEY.contains(key)) money(key, v);
        if (Set.of("phone", "whatsapp", "telegram").contains(key)) phone(key, v);
        if (key.equals("email") && !v.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
          throw invalid(key, "Enter a valid email address.");
        if (key.equals("work_email_existing")
            && !v.isEmpty()
            && !v.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
          throw invalid(key, "Enter a valid work email address.");
        if (key.equals("aadhaar") && !v.matches("[0-9]{12}"))
          throw invalid(key, "Enter 12 digits without spaces.");
        if (key.equals("pan") && !v.matches("[A-Z]{5}[0-9]{4}[A-Z]"))
          throw invalid(key, "Enter a PAN in the format ABCDE1234F.");
        if (key.equals("ifsc") && !v.matches("[A-Z]{4}0[A-Z0-9]{6}"))
          throw invalid(key, "Enter an 11-character IFSC code.");
        if (key.equals("account_number") && !v.matches("[0-9]{6,34}"))
          throw invalid(key, "Enter an account number as 6–34 digits.");
        if (custom.containsKey(key)) {
          var f = custom.get(key);
          if (f.type().equals("date")) date(key, v, false);
          if (f.type().equals("number")) number(key, v);
        }
      }
      values.put(key, v);
    }
    if (input.same_address())
      for (String key :
          List.of("house", "street", "area", "landmark", "city", "state", "country", "postal"))
        values.put("local_" + key, values.getOrDefault("permanent_" + key, ""));
    if (complete) {
      for (String key : List.of("name", "joiner", "joining", "phone"))
        if (values.getOrDefault(key, "").isBlank()) throw invalid(key, "This field is required.");
      for (var f : custom.values())
        if (f.visible() && f.required() && values.getOrDefault(f.id(), "").isBlank())
          throw invalid(f.id(), "This configured field is required.");
      if (values.get("joiner").equals("Rejoiner")
          && values.getOrDefault("previous_id", "").isBlank())
        throw invalid("previous_id", "Provide the employee code for the prior employment.");
      if (values.getOrDefault("work_email_mode", "").isBlank())
        values.put("work_email_mode", "generate");
      if (values.get("work_email_mode").equals("existing")
          && values.getOrDefault("work_email_existing", "").isBlank())
        throw invalid(
            "work_email_existing", "Enter the employee's existing company email address.");
    }
    var groups = new LinkedHashMap<String, List<Entry>>();
    for (var group : input.groups().entrySet()) {
      if (!GROUPS.containsKey(group.getKey())
          || group.getValue() == null
          || group.getValue().size() > 20)
        throw invalid("groups", "Use at most 20 entries per supported section.");
      var entries = new ArrayList<Entry>();
      var seen = new HashSet<String>();
      for (var entry : group.getValue()) {
        if (entry == null
            || entry.id() == null
            || entry.id().length() > 80
            || !seen.add(entry.id())
            || entry.values() == null
            || entry.values().size() > 4)
          throw invalid("groups", "Provide unique, bounded entry references.");
        var row = new LinkedHashMap<String, String>();
        for (var e : entry.values().entrySet()) {
          if (!GROUPS.get(group.getKey()).contains(e.getKey())
              || e.getValue() == null
              || e.getValue().length() > 254)
            throw invalid(group.getKey(), "Unknown or oversized repeated field.");
          String v = e.getValue().strip();
          row.put(e.getKey(), v);
          if (!v.isEmpty()) {
            if (e.getKey().equals("dob")) date("children", v, true);
            if (e.getKey().equals("amount")) money("allowances", v);
            if (e.getKey().equals("phone")) phone("emergency", v);
            if (e.getKey().equals("relationship")
                && !List.of("Guardian", "Parent", "Spouse", "Friend", "Other").contains(v))
              throw invalid("emergency", "Choose a supported relationship.");
            if (e.getKey().equals("context") && !List.of("Local", "Hometown", "Other").contains(v))
              throw invalid("emergency", "Choose a supported contact context.");
          }
        }
        if (row.values().stream().allMatch(String::isBlank)) continue;
        if (complete
            && (row.getOrDefault("name", "").isBlank()
                || group.getKey().equals("emergency") && row.getOrDefault("phone", "").isBlank()
                || group.getKey().equals("allowances") && row.getOrDefault("amount", "").isBlank()))
          throw invalid(
              group.getKey(), "Complete the name and required contact/amount in each added entry.");
        entries.add(new Entry(entry.id(), Map.copyOf(row)));
      }
      groups.put(group.getKey(), List.copyOf(entries));
    }
    return new Profile(Map.copyOf(values), Map.copyOf(groups), input.same_address());
  }

  private void date(String key, String v, boolean notFuture) {
    try {
      if (!v.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
      var d = LocalDate.parse(v);
      if (d.isBefore(LocalDate.of(1900, 1, 1)) || notFuture && d.isAfter(LocalDate.now()))
        throw new IllegalArgumentException();
    } catch (Exception e) {
      throw invalid(key, "Enter a valid YYYY-MM-DD date in the permitted range.");
    }
  }

  private void number(String key, String v) {
    try {
      var n = new BigDecimal(v);
      if (n.precision() > 20 || Math.abs((long) n.scale()) > 6)
        throw new IllegalArgumentException();
    } catch (Exception e) {
      throw invalid(key, "Enter a bounded decimal number.");
    }
  }

  private void money(String key, String v) {
    try {
      var n = new BigDecimal(v);
      if (n.signum() < 0 || n.precision() > 12 || n.scale() > 2 || n.scale() < -2)
        throw new IllegalArgumentException();
    } catch (Exception e) {
      throw invalid(key, "Enter a non-negative amount with up to two decimal places.");
    }
  }

  private void phone(String key, String v) {
    if (!v.matches("[+0-9 ()-]{7,24}")
        || v.replaceAll("[^0-9]", "").length() < 7
        || v.replaceAll("[^0-9]", "").length() > 15)
      throw invalid(key, "Enter a phone number with country code and 7–15 digits.");
  }

  private COSError invalid(String key, String message) {
    return new COSError(
        422,
        "PROFILE_VALIDATION_FAILED",
        "Correct the highlighted employee information.",
        Map.of(key, message));
  }
}
