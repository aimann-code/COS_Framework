package com.cos.hrms.emp;

import com.cos.shared.component.COSComponent;
import java.util.List;
import org.springframework.stereotype.Component;

/** Employee Management module (HRMS engine) registered with the COS framework. */
@Component
public class EmpComponent implements COSComponent {
  @Override
  public List<Module> modules() {
    return List.of(new Module("EMPLOYEES", "Employee records", "/people", "REGISTRAR,EMPLOYEE"));
  }
}
