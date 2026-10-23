package com.cos.shared.reg;

import java.text.Normalizer;
import java.util.*;

/** Domain-independent composite matching. It contains no employee-specific default key. */
public record UniqueKeyRule(int version, List<Field> fields) {
  public enum Normalization { EXACT, TRIM, CASE_FOLD }
  public record Field(String name, Normalization normalization) {}

  public UniqueKeyRule {
    if (version < 1 || fields == null || fields.size() < 2 || fields.size() > 32)
      throw new IllegalArgumentException("Select between two and 32 unique-key fields.");
    var names = new HashSet<String>();
    for (Field field : fields) {
      if (field == null || field.name() == null
          || !field.name().matches("[a-z][a-z0-9_]{0,79}")
          || field.normalization() == null || !names.add(field.name()))
        throw new IllegalArgumentException("Use distinct valid field names and normalization modes.");
    }
    fields = List.copyOf(fields);
  }

  public List<String> missing(Map<String, String> values) {
    Objects.requireNonNull(values, "values");
    return fields.stream().map(Field::name)
        .filter(name -> values.get(name) == null || values.get(name).isBlank()).toList();
  }

  /** Length-delimited values prevent ambiguous concatenation; caller applies a keyed digest. */
  public String canonical(Map<String, String> values) {
    var missing = missing(values);
    if (!missing.isEmpty()) throw new MissingValues(missing);
    var out = new StringBuilder();
    for (Field field : fields) {
      String value = Normalizer.normalize(values.get(field.name()), Normalizer.Form.NFC);
      value = switch (field.normalization()) {
        case EXACT -> value;
        case TRIM -> value.strip();
        case CASE_FOLD -> value.strip().toLowerCase(Locale.ROOT);
      };
      append(out, field.name());
      append(out, value);
    }
    return out.toString();
  }

  private static void append(StringBuilder out, String value) {
    // Reject unpaired surrogates rather than hashing a lossy UTF-8 replacement character.
    for (int i = 0; i < value.length(); i++) {
      char ch = value.charAt(i);
      if (Character.isHighSurrogate(ch)) {
        if (++i >= value.length() || !Character.isLowSurrogate(value.charAt(i)))
          throw new IllegalArgumentException("Invalid Unicode value.");
      } else if (Character.isLowSurrogate(ch)) {
        throw new IllegalArgumentException("Invalid Unicode value.");
      }
    }
    out.append(value.length()).append(':').append(value);
  }

  public static final class MissingValues extends IllegalArgumentException {
    private final List<String> fields;
    public MissingValues(List<String> fields) {
      super("Required unique-key fields are missing.");
      this.fields = List.copyOf(fields);
    }
    public List<String> fields() { return fields; }
  }
}
