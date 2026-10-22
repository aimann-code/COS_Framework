CREATE SCHEMA people;
CREATE TABLE people.employee (
  employee_id uuid PRIMARY KEY, scope_id text NOT NULL REFERENCES meta.scope,
  employee_code text NOT NULL, display_name varchar(160) NOT NULL,
  profile_encrypted text NOT NULL, profile_version integer NOT NULL CHECK(profile_version>0),
  aadhaar_hash text, pan_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,employee_id), UNIQUE(scope_id,employee_code), UNIQUE(scope_id,aadhaar_hash), UNIQUE(scope_id,pan_hash)
);
CREATE TABLE people.employee_membership (
  scope_id text NOT NULL REFERENCES meta.scope, actor_id text NOT NULL, employee_id uuid NOT NULL,
  linked_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope_id,actor_id), UNIQUE(scope_id,employee_id),
  FOREIGN KEY(scope_id,employee_id) REFERENCES people.employee(scope_id,employee_id)
);
CREATE TABLE people.profile_draft (
  draft_id uuid PRIMARY KEY, scope_id text NOT NULL REFERENCES meta.scope, actor_id text NOT NULL,
  body_encrypted text NOT NULL, version integer NOT NULL CHECK(version>0),
  configuration_version integer NOT NULL, employee_id uuid, expected_employee_version integer,
  status text NOT NULL CHECK(status IN ('DRAFT','REGISTERED','SUBMITTED','APPROVED','REJECTED')),
  review_note varchar(500), reviewed_by text, reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,draft_id), FOREIGN KEY(scope_id,employee_id) REFERENCES people.employee(scope_id,employee_id)
);
CREATE INDEX ix_profile_draft_actor ON people.profile_draft(scope_id,actor_id,status,updated_at);
CREATE INDEX ix_profile_draft_review ON people.profile_draft(scope_id,status,created_at);
CREATE TABLE people.profile_history (
  history_id uuid PRIMARY KEY, scope_id text NOT NULL, employee_id uuid NOT NULL, profile_version integer NOT NULL,
  body_encrypted text NOT NULL, actor_id text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,employee_id,profile_version), FOREIGN KEY(scope_id,employee_id) REFERENCES people.employee(scope_id,employee_id)
);
CREATE TRIGGER immutable_profile_history BEFORE UPDATE OR DELETE ON people.profile_history FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TABLE people.employment_period (
  period_id uuid PRIMARY KEY, scope_id text NOT NULL, employee_id uuid NOT NULL, joining_date date NOT NULL,
  joining_type text NOT NULL CHECK(joining_type IN ('New joiner','Rejoiner')), ended_on date,
  FOREIGN KEY(scope_id,employee_id) REFERENCES people.employee(scope_id,employee_id),
  UNIQUE(scope_id,employee_id,joining_date), CHECK(ended_on IS NULL OR ended_on>=joining_date)
);
CREATE INDEX ix_employment_employee ON people.employment_period(scope_id,employee_id);
CREATE TABLE people.document (
  document_id uuid PRIMARY KEY, scope_id text NOT NULL, draft_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('AADHAAR_FRONT','AADHAAR_BACK','PAN')),
  encrypted_content text NOT NULL, media_type text NOT NULL CHECK(media_type IN ('image/png','image/jpeg')),
  byte_count integer NOT NULL CHECK(byte_count BETWEEN 1 AND 5242880), digest text NOT NULL,
  scan_status text NOT NULL CHECK(scan_status IN ('SCANNED','VALIDATED_LOCAL')),
  uploaded_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  FOREIGN KEY(scope_id,draft_id) REFERENCES people.profile_draft(scope_id,draft_id)
);
CREATE UNIQUE INDEX uq_document_current ON people.document(scope_id,draft_id,kind) WHERE deleted_at IS NULL;
CREATE INDEX ix_document_draft ON people.document(scope_id,draft_id);
CREATE TABLE people.outbox (
  event_id uuid PRIMARY KEY, scope_id text NOT NULL REFERENCES meta.scope, employee_id uuid NOT NULL,
  event_type text NOT NULL, profile_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz, UNIQUE(scope_id,employee_id,event_type,profile_version),
  FOREIGN KEY(scope_id,employee_id) REFERENCES people.employee(scope_id,employee_id)
);
ALTER TABLE auth.account DROP CONSTRAINT account_role_check;
ALTER TABLE auth.account ADD CONSTRAINT account_role_check CHECK(role IN ('VIEWER','REGISTRAR','EMPLOYEE'));
