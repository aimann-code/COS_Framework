package com.cos.shared.req;

import com.cos.shared.COSError;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "cos.worker-enabled", havingValue = "true", matchIfMissing = true)
public class COSWorker {
  private static final Logger LOG = LoggerFactory.getLogger(COSWorker.class);
  private final COSRequestRepository requests;
  private final COSExecutionService execution;

  public COSWorker(COSRequestRepository requests, COSExecutionService execution) {
    this.requests = requests;
    this.execution = execution;
  }

  @Scheduled(fixedDelayString = "${cos.worker-delay-ms:1500}")
  public void poll() {
    for (var next : requests.approved()) {
      UUID id = UUID.fromString(next.get("id"));
      try {
        execution.execute(id, next.get("scope"));
      } catch (Exception e) {
        String code = e instanceof COSError domain ? domain.code : "EXECUTION_FAILED";
        LOG.warn("Request execution failed request={} code={}", id, code);
        execution.failed(id, next.get("scope"), code);
      }
    }
  }
}
