package com.cos.hrms.emp.reg;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("cos.mail")
public class WorkEmailProperties {
  private String domain = "example.mhl.test";

  public String getDomain() {
    return domain;
  }

  public void setDomain(String domain) {
    this.domain = domain;
  }
}
