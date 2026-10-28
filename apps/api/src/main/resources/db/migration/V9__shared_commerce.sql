CREATE SCHEMA commerce;

-- These are local reference prices, not an approved commercial price list or payment gateway.
CREATE TABLE commerce.service_descriptor (
  service_code text PRIMARY KEY,
  name varchar(100) NOT NULL,
  suite varchar(100) NOT NULL,
  engine varchar(100) NOT NULL,
  description varchar(1000) NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor > 0 AND price_minor <= 1000000000),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  billing_period text NOT NULL DEFAULT 'MONTHLY' CHECK (billing_period = 'MONTHLY'),
  module_codes jsonb NOT NULL CHECK (jsonb_typeof(module_codes) = 'array'),
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dependencies) = 'array'),
  api_prefixes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(api_prefixes) = 'array'),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
INSERT INTO commerce.service_descriptor
 (service_code,name,suite,engine,description,price_minor,module_codes,dependencies,api_prefixes)
VALUES
 ('EMPLOYEE_MANAGEMENT','Employee management','Enterprise Management','HRMS',
  'Employee records, HR registration, verified employee access and profile change review.',149900,
  '["EMPLOYEES"]','[]','["/api/v1/cos/onboarding","/api/v1/cos/employees","/api/v1/cos/components/EMP_Reg","/api/v1/cos/requests","/api/v1/cos/employee-import-previews","/api/v1/cos/import-previews","/api/v1/cos/employee-sheet-sync-previews"]'),
 ('LEAVE_MANAGEMENT','Leave management','Enterprise Management','HRMS',
  'Employee leave applications, HR review, balances and configurable leave policies.',49900,
  '["LEAVE","LEAVE_POLICY"]','["EMPLOYEE_MANAGEMENT"]','["/api/v1/cos/leave"]');

CREATE TABLE commerce.company (
  company_id uuid PRIMARY KEY REFERENCES auth.company_request(request_id),
  reference varchar(60) NOT NULL UNIQUE,
  scope_id text UNIQUE REFERENCES meta.scope,
  status text NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (status IN ('PENDING_PAYMENT','PAYMENT_REVIEW','PAYMENT_REJECTED','ACTIVE')),
  service_snapshot jsonb NOT NULL CHECK (jsonb_typeof(service_snapshot) = 'array'),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  billing_period text NOT NULL DEFAULT 'MONTHLY' CHECK (billing_period = 'MONTHLY'),
  token_digest char(64) NOT NULL,
  token_expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  CHECK ((status = 'ACTIVE' AND scope_id IS NOT NULL AND activated_at IS NOT NULL)
      OR (status <> 'ACTIVE' AND scope_id IS NULL AND activated_at IS NULL))
);
CREATE INDEX ix_commerce_company_status ON commerce.company(status,created_at);

CREATE TABLE commerce.payment (
  payment_id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES commerce.company,
  payment_reference varchar(100) NOT NULL UNIQUE,
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  currency char(3) NOT NULL CHECK (currency = 'INR'),
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  remarks varchar(500),
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK ((status = 'PENDING_REVIEW' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'PENDING_REVIEW' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_commerce_payment_pending ON commerce.payment(company_id) WHERE status='PENDING_REVIEW';
CREATE INDEX ix_commerce_payment_review ON commerce.payment(status,created_at);

CREATE TABLE commerce.entitlement (
  company_id uuid NOT NULL REFERENCES commerce.company,
  scope_id text NOT NULL REFERENCES meta.scope,
  service_code text NOT NULL REFERENCES commerce.service_descriptor,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','DISABLED')),
  payment_id uuid NOT NULL REFERENCES commerce.payment,
  activated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,service_code),
  UNIQUE (scope_id,service_code)
);

CREATE TABLE commerce.configuration_request (
  request_id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES commerce.company,
  scope_id text NOT NULL REFERENCES meta.scope,
  service_code text NOT NULL REFERENCES commerce.service_descriptor,
  kind text NOT NULL CHECK (kind = 'FIELD_ADD'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  reason varchar(1000) NOT NULL,
  submitted_by text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  remarks varchar(500),
  reviewed_by text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  base_config_version integer NOT NULL CHECK (base_config_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  FOREIGN KEY (scope_id,service_code) REFERENCES commerce.entitlement(scope_id,service_code)
);
CREATE INDEX ix_commerce_config_review ON commerce.configuration_request(status,created_at);
CREATE UNIQUE INDEX uq_commerce_config_pending_field ON commerce.configuration_request
 (scope_id,service_code,(payload->>'technical_name')) WHERE status='PENDING_REVIEW';

CREATE TABLE commerce.service_field (
  scope_id text NOT NULL REFERENCES meta.scope,
  service_code text NOT NULL REFERENCES commerce.service_descriptor,
  field_id uuid NOT NULL,
  configuration_request_id uuid NOT NULL UNIQUE REFERENCES commerce.configuration_request,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id,service_code,field_id),
  FOREIGN KEY (scope_id,field_id) REFERENCES meta.field_definition(scope_id,field_id)
);

CREATE TABLE commerce.event (
  event_id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES commerce.company,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_commerce_event BEFORE UPDATE OR DELETE ON commerce.event
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
