ALTER TABLE meta.field_definition
  ADD COLUMN label text,
  ADD COLUMN sensitive boolean NOT NULL DEFAULT false;

UPDATE meta.field_definition f
SET label = left(COALESCE(
      (SELECT cf.policy->>'label' FROM meta.component_field cf
        WHERE cf.field_id = f.field_id AND COALESCE(cf.policy->>'label', '') <> ''
        LIMIT 1),
      f.technical_name), 80)
WHERE f.label IS NULL;

ALTER TABLE meta.field_definition ALTER COLUMN label SET NOT NULL;

UPDATE meta.field_definition f
SET sensitive = true
WHERE EXISTS (
  SELECT 1 FROM meta.component_field cf
  WHERE cf.field_id = f.field_id AND COALESCE(cf.policy->>'sensitive', 'false') = 'true');

CREATE TABLE meta.data_table (
  table_id uuid PRIMARY KEY,
  readable_id text NOT NULL UNIQUE,
  scope_id text NOT NULL REFERENCES meta.scope,
  technical_name text NOT NULL,
  label text NOT NULL,
  grain text NOT NULL CHECK (grain IN ('EMPLOYEE', 'CATALOG')),
  registered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, technical_name)
);

CREATE TABLE meta.table_field (
  table_id uuid NOT NULL REFERENCES meta.data_table,
  field_id uuid NOT NULL REFERENCES meta.field_definition,
  scope_id text NOT NULL,
  display_order integer NOT NULL CHECK (display_order >= 0),
  PRIMARY KEY (table_id, field_id),
  UNIQUE (table_id, display_order),
  FOREIGN KEY (scope_id, field_id) REFERENCES meta.field_definition (scope_id, field_id)
);

CREATE INDEX ix_table_field_field ON meta.table_field (scope_id, field_id);

CREATE TABLE people.employee_field_value (
  scope_id text NOT NULL,
  employee_id uuid NOT NULL,
  field_id uuid NOT NULL,
  config_version integer NOT NULL CHECK (config_version > 0),
  value_text text,
  value_date date,
  value_number numeric,
  value_ciphertext text,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, field_id),
  FOREIGN KEY (scope_id, employee_id) REFERENCES people.employee (scope_id, employee_id),
  FOREIGN KEY (scope_id, field_id) REFERENCES meta.field_definition (scope_id, field_id),
  CHECK (num_nonnulls(value_text, value_date, value_number, value_ciphertext) = 1)
);

CREATE INDEX ix_employee_field_value_field ON people.employee_field_value (scope_id, field_id);

CREATE TABLE people.identity_link (
  link_id uuid PRIMARY KEY,
  readable_id text NOT NULL UNIQUE,
  scope_id text NOT NULL,
  employee_id uuid NOT NULL,
  system_code text NOT NULL CHECK (system_code IN ('SYS', 'RZP', 'ATTENDO')),
  external_id text NOT NULL,
  external_name text,
  valid_from date NOT NULL,
  valid_to date,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (scope_id, employee_id) REFERENCES people.employee (scope_id, employee_id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX uq_identity_open
  ON people.identity_link (scope_id, employee_id, system_code)
  WHERE valid_to IS NULL;

CREATE UNIQUE INDEX uq_identity_external
  ON people.identity_link (scope_id, system_code, lower(external_id))
  WHERE valid_to IS NULL;

CREATE INDEX ix_identity_employee ON people.identity_link (scope_id, employee_id);

CREATE TABLE integration.sync_record (
  sync_row_id uuid PRIMARY KEY,
  readable_id text NOT NULL UNIQUE,
  scope_id text NOT NULL REFERENCES meta.scope,
  source_name text NOT NULL,
  source_key text NOT NULL,
  sync_id text NOT NULL,
  sync_status text NOT NULL CHECK (sync_status IN ('SYNCED', 'ABSENT', 'CONFLICT')),
  sync_version integer NOT NULL CHECK (sync_version > 0),
  target_kind text NOT NULL CHECK (target_kind IN ('EMPLOYEE', 'FIELD', 'TABLE')),
  target_key text NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, source_name, source_key)
);

CREATE INDEX ix_sync_target ON integration.sync_record (scope_id, target_kind, target_key);
