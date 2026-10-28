package com.cos.shared.component;

import java.util.List;

/**
 * Contract a COS component implements to plug into the shared framework. Components are Spring
 * beans; the framework discovers every implementation instead of listing components itself.
 */
public interface COSComponent {
  /** Navigation entries this component contributes to meta.module for each company scope. */
  List<Module> modules();

  /** Idempotent defaults for a company scope, such as policy rows. */
  default void seed(String scope) {}

  record Module(String code, String name, String route, String audience) {}
}
