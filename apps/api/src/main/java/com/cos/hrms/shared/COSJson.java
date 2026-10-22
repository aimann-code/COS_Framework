package com.cos.hrms.shared;

import java.util.TreeMap;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class COSJson {
  private final JsonMapper mapper;

  public COSJson(JsonMapper mapper) {
    this.mapper = mapper;
  }

  public String write(Object value) {
    return mapper.writeValueAsString(value);
  }

  public <T> T read(String value, Class<T> type) {
    return mapper.readValue(value, type);
  }

  public JsonNode tree(Object value) {
    return mapper.valueToTree(value);
  }

  public <T> T convert(JsonNode value, Class<T> type) {
    return mapper.treeToValue(value, type);
  }

  public String canonical(JsonNode node) {
    if (node.isObject()) {
      var sorted = new TreeMap<String, String>();
      node.properties().forEach(e -> sorted.put(e.getKey(), canonical(e.getValue())));
      return "{"
          + String.join(
              ",",
              sorted.entrySet().stream().map(e -> write(e.getKey()) + ":" + e.getValue()).toList())
          + "}";
    }
    if (node.isArray()) {
      var out = new java.util.ArrayList<String>();
      node.forEach(n -> out.add(canonical(n)));
      return "[" + String.join(",", out) + "]";
    }
    return node.toString();
  }
}
