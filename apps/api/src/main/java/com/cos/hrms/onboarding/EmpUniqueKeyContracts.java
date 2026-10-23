package com.cos.hrms.onboarding;

import com.cos.shared.reg.UniqueKeyRule;
import jakarta.validation.constraints.*;
import java.util.*;

public final class EmpUniqueKeyContracts {
  private EmpUniqueKeyContracts() {}
  public record ActivateReqDTO(
      @Min(0) int expectedVersion,
      @NotNull @Size(min=2,max=32) List<UniqueKeyRule.Field> fields,
      @NotNull @Size(max=8) Map<String,String> messages,
      boolean confirmed) {}
  public record RuleResDTO(
      int version, List<UniqueKeyRule.Field> fields, Map<String,String> messages) {}
}
