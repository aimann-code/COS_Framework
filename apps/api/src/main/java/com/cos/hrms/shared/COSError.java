package com.cos.hrms.shared;

import java.util.Map;

public class COSError extends RuntimeException {
  public final int status;
  public final String code;
  public final Map<String, String> fields;

  public COSError(int status, String code, String message) {
    this(status, code, message, Map.of());
  }

  public COSError(int status, String code, String message, Map<String, String> fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = Map.copyOf(fields);
  }

  public static COSError conflict(String code, String message) {
    return new COSError(409, code, message);
  }

  public static COSError forbidden() {
    return new COSError(403, "FORBIDDEN", "You do not have permission for this operation.");
  }

  public static COSError missing() {
    return new COSError(404, "NOT_FOUND", "The requested record was not found.");
  }
}
