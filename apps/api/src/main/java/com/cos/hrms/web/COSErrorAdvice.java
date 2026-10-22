package com.cos.hrms.web;

import com.cos.hrms.shared.COSError;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class COSErrorAdvice extends ResponseEntityExceptionHandler {
  private static final Logger LOG = LoggerFactory.getLogger(COSErrorAdvice.class);

  @ExceptionHandler(COSError.class)
  ResponseEntity<ProblemDetail> domain(COSError e) {
    var body = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(e.status), e.getMessage());
    body.setProperty("error_code", e.code);
    body.setProperty("validation_errors", e.fields);
    return ResponseEntity.status(e.status).body(body);
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<ProblemDetail> conflict(DataIntegrityViolationException e) {
    return domain(
        COSError.conflict(
            "DATA_CONFLICT",
            "The request conflicts with existing data. Refresh and review before retrying."));
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<ProblemDetail> denied(AccessDeniedException e) {
    return domain(COSError.forbidden());
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ProblemDetail> unexpected(Exception e) {
    String correlation = UUID.randomUUID().toString();
    LOG.error(
        "Unexpected failure correlation={} type={}", correlation, e.getClass().getSimpleName());
    var body =
        ProblemDetail.forStatusAndDetail(
            HttpStatusCode.valueOf(500), "An unexpected error occurred.");
    body.setProperty("error_code", "INTERNAL_ERROR");
    body.setProperty("correlation_id", correlation);
    return ResponseEntity.status(500).body(body);
  }
}
