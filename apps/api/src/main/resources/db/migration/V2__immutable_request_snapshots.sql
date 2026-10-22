-- Approval/execution state may change; submitted evidence and committed results may not.
CREATE FUNCTION integration.protect_request_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.request_id,NEW.readable_id,NEW.scope_id,NEW.actor_id,NEW.operation,
         NEW.config_id,NEW.request_version,NEW.idempotency_key,NEW.payload_hash,
         NEW.payload_encrypted,NEW.employee_key,NEW.expected_record_version,NEW.preview_id,NEW.submitted_at)
     IS DISTINCT FROM
     ROW(OLD.request_id,OLD.readable_id,OLD.scope_id,OLD.actor_id,OLD.operation,
         OLD.config_id,OLD.request_version,OLD.idempotency_key,OLD.payload_hash,
         OLD.payload_encrypted,OLD.employee_key,OLD.expected_record_version,OLD.preview_id,OLD.submitted_at)
  THEN RAISE EXCEPTION 'Submitted request snapshots are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER request_snapshot_immutable BEFORE UPDATE ON integration.request
  FOR EACH ROW EXECUTE FUNCTION integration.protect_request_snapshot();
CREATE TRIGGER request_result_immutable BEFORE UPDATE OR DELETE ON integration.request_result
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
