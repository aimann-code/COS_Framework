package com.cos.shared.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("cos")
public class COSProperties {
  private String encryptionKey, fingerprintKey, jwtSecret, scopeId, idPrefix, manualIdPattern;
  private String registrarPassword, adminPassword, reviewerPassword, viewerPassword;
  private String allowedOrigins = "http://127.0.0.1:3000";
  private boolean cookieSecure;

  public String getEncryptionKey() {
    return encryptionKey;
  }

  public void setEncryptionKey(String v) {
    encryptionKey = v;
  }

  public String getFingerprintKey() {
    return fingerprintKey;
  }

  public void setFingerprintKey(String v) {
    fingerprintKey = v;
  }

  public String getJwtSecret() {
    return jwtSecret;
  }

  public void setJwtSecret(String v) {
    jwtSecret = v;
  }

  public String getScopeId() {
    return scopeId;
  }

  public void setScopeId(String v) {
    scopeId = v;
  }

  public String getIdPrefix() {
    return idPrefix;
  }

  public void setIdPrefix(String v) {
    idPrefix = v;
  }

  public String getManualIdPattern() {
    return manualIdPattern;
  }

  public void setManualIdPattern(String v) {
    manualIdPattern = v;
  }

  public String getRegistrarPassword() {
    return registrarPassword;
  }

  public void setRegistrarPassword(String v) {
    registrarPassword = v;
  }

  public String getAdminPassword() {
    return adminPassword;
  }

  public void setAdminPassword(String v) {
    adminPassword = v;
  }

  public String getReviewerPassword() {
    return reviewerPassword;
  }

  public void setReviewerPassword(String v) {
    reviewerPassword = v;
  }

  public String getViewerPassword() {
    return viewerPassword;
  }

  public void setViewerPassword(String v) {
    viewerPassword = v;
  }

  public String getAllowedOrigins() {
    return allowedOrigins;
  }

  public void setAllowedOrigins(String v) {
    allowedOrigins = v;
  }

  public boolean isCookieSecure() {
    return cookieSecure;
  }

  public void setCookieSecure(boolean v) {
    cookieSecure = v;
  }
  // Deliberately no generated toString: this object contains secret values.
}
