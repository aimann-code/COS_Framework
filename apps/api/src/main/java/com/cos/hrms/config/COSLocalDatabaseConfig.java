package com.cos.hrms.config;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("local")
public class COSLocalDatabaseConfig {
  @Bean(destroyMethod = "close")
  EmbeddedPostgres local_postgres(COSProperties properties) throws Exception {
    return EmbeddedPostgres.builder()
        .setDataDirectory(properties.getDataDirectory())
        .setCleanDataDirectory(false)
        .setServerConfig("listen_addresses", "127.0.0.1")
        .setPort(0)
        .start();
  }

  @Bean
  DataSource data_source(EmbeddedPostgres postgres) {
    return postgres.getPostgresDatabase();
  }
}
