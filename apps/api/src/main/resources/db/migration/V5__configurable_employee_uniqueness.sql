-- Forward-only migration. Existing people schema, employee IDs and encryption contexts stay intact.
-- No default key, owner, group membership or subscription is silently assigned.
CREATE TABLE meta.unique_rule (
  scope_id text NOT NULL REFERENCES meta.scope,
  object_code text NOT NULL CHECK (object_code='emp_reg'),
  version integer NOT NULL CHECK (version>0),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields)='array' AND jsonb_array_length(fields) BETWEEN 2 AND 32),
  messages jsonb NOT NULL CHECK (jsonb_typeof(messages)='object'),
  approved_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope_id,object_code,version)
);
CREATE TABLE meta.active_unique_rule (
  scope_id text NOT NULL, object_code text NOT NULL, version integer NOT NULL,
  PRIMARY KEY(scope_id,object_code),
  FOREIGN KEY(scope_id,object_code,version) REFERENCES meta.unique_rule
);
CREATE TABLE meta.unique_claim (
  scope_id text NOT NULL, object_code text NOT NULL, rule_version integer NOT NULL,
  key_token text NOT NULL CHECK(length(key_token)=64), employee_id uuid NOT NULL,
  PRIMARY KEY(scope_id,object_code,rule_version,key_token),
  UNIQUE(scope_id,object_code,rule_version,employee_id),
  FOREIGN KEY(scope_id,object_code,rule_version) REFERENCES meta.unique_rule,
  FOREIGN KEY(scope_id,employee_id) REFERENCES people.employee(scope_id,employee_id)
);
CREATE TRIGGER immutable_unique_rule BEFORE UPDATE OR DELETE ON meta.unique_rule
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

-- Narrow, explicitly provisioned entity administration grant. Existing ADMIN role alone is insufficient.
CREATE TABLE meta.key_admin_group (
  scope_id text NOT NULL REFERENCES meta.scope, group_id uuid NOT NULL,
  name text NOT NULL, can_read boolean NOT NULL DEFAULT false, can_write boolean NOT NULL DEFAULT false,
  PRIMARY KEY(scope_id,group_id)
);
CREATE TABLE meta.key_admin_member (
  scope_id text NOT NULL, group_id uuid NOT NULL, actor_id text NOT NULL,
  PRIMARY KEY(scope_id,group_id,actor_id),
  FOREIGN KEY(scope_id,group_id) REFERENCES meta.key_admin_group
);
-- Retire fixed individual identifier matching. All onboarding writes now require an active composite rule.
ALTER TABLE people.employee DROP CONSTRAINT employee_scope_id_aadhaar_hash_key;
ALTER TABLE people.employee DROP CONSTRAINT employee_scope_id_pan_hash_key;
