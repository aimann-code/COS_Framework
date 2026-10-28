package com.cos.hrms.leave;

import com.cos.shared.component.COSComponent;
import java.util.List;
import org.springframework.stereotype.Component;

/** Leave Management module (HRMS engine) registered with the COS framework. */
@Component
public class LeaveComponent implements COSComponent {
  private final LeaveService leave;

  public LeaveComponent(LeaveService leave) {
    this.leave = leave;
  }

  @Override
  public List<Module> modules() {
    return List.of(
        new Module("LEAVE", "Leave", "/people/leave", "REGISTRAR,EMPLOYEE,ADMIN"),
        new Module("LEAVE_POLICY", "Leave policy", "/people/leave/policies", "REGISTRAR,ADMIN"));
  }

  @Override
  public void seed(String scope) {
    leave.ensure(scope);
  }
}
