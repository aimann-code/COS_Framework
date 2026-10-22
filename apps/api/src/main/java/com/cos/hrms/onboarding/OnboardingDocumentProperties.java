package com.cos.hrms.onboarding;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("cos.onboarding.documents")
public class OnboardingDocumentProperties {
  private String scannerHost = "";
  private int scannerPort = 3310;

  public String getScannerHost() {
    return scannerHost;
  }

  public void setScannerHost(String value) {
    scannerHost = value;
  }

  public int getScannerPort() {
    return scannerPort;
  }

  public void setScannerPort(int value) {
    if (value < 1 || value > 65535) throw new IllegalArgumentException("Invalid scanner port");
    scannerPort = value;
  }
}
