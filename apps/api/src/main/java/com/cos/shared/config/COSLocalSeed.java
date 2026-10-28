package com.cos.shared.config;

import com.cos.shared.component.COSComponent;
import com.cos.shared.metadata.COSMetadataService;
import java.util.List;
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
      com.cos.shared.metadata.ModuleCatalog.ModuleService modules,
      List<COSComponent> components) {
    return args -> {
      metadata.seedLocal(p.getScopeId());
      modules.ensure(p.getScopeId());
      components.forEach(component -> component.seed(p.getScopeId()));
    };
  }
}
