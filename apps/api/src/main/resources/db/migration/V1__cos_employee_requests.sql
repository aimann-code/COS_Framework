CREATE SCHEMA meta;
CREATE SCHEMA core;
CREATE SCHEMA integration;
CREATE SCHEMA audit;
CREATE SCHEMA ui;

CREATE TABLE meta.scope (
  scope_id text PRIMARY KEY, scope_key uuid NOT NULL UNIQUE, readable_id text NOT NULL UNIQUE,
  label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE meta.component_config (
  config_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE,
  scope_id text NOT NULL REFERENCES meta.scope, version integer NOT NULL CHECK(version>0),
  body jsonb NOT NULL, approved_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,version), UNIQUE(scope_id,config_id)
);
CREATE TABLE meta.active_config (
  scope_id text PRIMARY KEY REFERENCES meta.scope, config_id uuid NOT NULL,
  FOREIGN KEY(scope_id,config_id) REFERENCES meta.component_config(scope_id,config_id)
);
CREATE TABLE meta.field_definition (
  field_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE, scope_id text NOT NULL REFERENCES meta.scope,
  technical_name text NOT NULL, data_type text NOT NULL CHECK(data_type IN ('text','date','number')),
  UNIQUE(scope_id,technical_name), UNIQUE(scope_id,field_id)
);
CREATE TABLE meta.component_field (
  config_id uuid NOT NULL REFERENCES meta.component_config, field_id uuid NOT NULL REFERENCES meta.field_definition,
  required boolean NOT NULL, display_order integer NOT NULL, policy jsonb NOT NULL,
  PRIMARY KEY(config_id,field_id)
);
CREATE TABLE meta.controlled_value (
  value_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE, scope_id text NOT NULL REFERENCES meta.scope,
  category text NOT NULL, code text NOT NULL, label text NOT NULL, active boolean NOT NULL DEFAULT true,
  UNIQUE(scope_id,category,code), UNIQUE(scope_id,value_id)
);
CREATE TABLE meta.id_counter (
  scope_id text PRIMARY KEY REFERENCES meta.scope, next_value bigint NOT NULL DEFAULT 0 CHECK(next_value>=0)
);
CREATE TABLE core.employee_identity (
  employee_key uuid PRIMARY KEY, scope_id text NOT NULL REFERENCES meta.scope, sys_emp_id text NOT NULL,
  employee_name text NOT NULL, father_name text NOT NULL,
  nationality_id uuid NOT NULL, national_id_type_id uuid NOT NULL,
  id_number_ciphertext text NOT NULL, identity_fingerprint text NOT NULL, fingerprint_version integer NOT NULL DEFAULT 1,
  record_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(scope_id,nationality_id) REFERENCES meta.controlled_value(scope_id,value_id),
  FOREIGN KEY(scope_id,national_id_type_id) REFERENCES meta.controlled_value(scope_id,value_id),
  UNIQUE(scope_id,sys_emp_id), UNIQUE(scope_id,identity_fingerprint), UNIQUE(scope_id,employee_key)
);
CREATE UNIQUE INDEX uq_employee_scope_normalized_id ON core.employee_identity(scope_id,lower(sys_emp_id));
CREATE TABLE core.employee_field_value (
  employee_key uuid NOT NULL REFERENCES core.employee_identity, field_id uuid NOT NULL REFERENCES meta.field_definition,
  config_id uuid NOT NULL, value_text text, value_date date, value_number numeric, value_ciphertext text,
  PRIMARY KEY(employee_key,field_id),
  FOREIGN KEY(config_id,field_id) REFERENCES meta.component_field(config_id,field_id),
  CHECK(num_nonnulls(value_text,value_date,value_number,value_ciphertext)=1)
);
CREATE TABLE integration.import_preview (
  preview_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE, scope_id text NOT NULL REFERENCES meta.scope,
  actor_id text NOT NULL, config_id uuid NOT NULL REFERENCES meta.component_config,
  source_hash text NOT NULL, snapshot_hash text NOT NULL, mapping_version text NOT NULL,
  source_name text NOT NULL, input_method text NOT NULL CHECK(input_method='BULK_UPLOAD'),
  snapshot_encrypted text NOT NULL, row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE integration.request (
  request_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE, scope_id text NOT NULL REFERENCES meta.scope,
  actor_id text NOT NULL, operation text NOT NULL CHECK(operation IN ('REGISTER','UPDATE','CONFIGURATION','BULK_REGISTER')),
  config_id uuid NOT NULL REFERENCES meta.component_config, request_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL, payload_hash text NOT NULL, payload_encrypted text NOT NULL,
  status text NOT NULL CHECK(status IN ('PENDING_APPROVAL','APPROVED','EXECUTING','COMPLETED','FAILED','REJECTED')),
  employee_key uuid REFERENCES core.employee_identity, expected_record_version integer,
  preview_id uuid UNIQUE REFERENCES integration.import_preview, submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_by text, remarks text, failure_code text, attempts integer NOT NULL DEFAULT 0,
  UNIQUE(scope_id,actor_id,idempotency_key)
);
CREATE INDEX ix_request_work ON integration.request(status,submitted_at);
CREATE INDEX ix_request_actor ON integration.request(scope_id,actor_id,request_id);
CREATE TABLE integration.request_item (
  request_item_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE,
  request_id uuid NOT NULL REFERENCES integration.request, ordinal integer NOT NULL,
  employee_key uuid REFERENCES core.employee_identity, state text NOT NULL, error_code text,
  UNIQUE(request_id,ordinal)
);
CREATE TABLE integration.approval_event (
  approval_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE,
  request_id uuid NOT NULL REFERENCES integration.request, request_version integer NOT NULL,
  actor_id text NOT NULL, decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
  remarks text NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integration.request_result (
  request_id uuid PRIMARY KEY REFERENCES integration.request, result_id uuid NOT NULL UNIQUE,
  readable_id text NOT NULL UNIQUE, result jsonb NOT NULL, committed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integration.outbox_event (
  event_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE, request_id uuid NOT NULL REFERENCES integration.request,
  event_type text NOT NULL, state text NOT NULL DEFAULT 'PENDING', payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,event_type)
);
CREATE INDEX ix_outbox_pending ON integration.outbox_event(state,created_at);
CREATE TABLE audit.event (
  event_id uuid PRIMARY KEY, readable_id text NOT NULL UNIQUE, scope_id text NOT NULL REFERENCES meta.scope,
  actor_id text NOT NULL, request_id uuid REFERENCES integration.request,
  action text NOT NULL, target_key text NOT NULL, outcome text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_scope ON audit.event(scope_id,occurred_at);
CREATE TABLE ui.user_favorite (
  scope_id text NOT NULL REFERENCES meta.scope, actor_id text NOT NULL, component_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope_id,actor_id,component_id)
);
CREATE FUNCTION audit.prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only record'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit.event FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER immutable_approval BEFORE UPDATE OR DELETE ON integration.approval_event FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER immutable_config BEFORE UPDATE OR DELETE ON meta.component_config FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE VIEW core.employee_identity_master AS SELECT employee_key,scope_id,sys_emp_id,employee_name,record_version FROM core.employee_identity;
