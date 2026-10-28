package com.cos.hrms.config;

import com.cos.hrms.metadata.COSMetadataService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("local")
public class COSLocalSeed {
  @Bean
  ApplicationRunner local_seed(
      COSMetadataService metadata,
      COSProperties p,
      com.cos.hrms.metadata.ModuleCatalog.ModuleService modules,
      com.cos.hrms.leave.LeaveService leave) {
    return args -> {
      metadata.seedLocal(p.getScopeId());
      modules.ensure(p.getScopeId());
      leave.ensure(p.getScopeId());
    };
  }
}
