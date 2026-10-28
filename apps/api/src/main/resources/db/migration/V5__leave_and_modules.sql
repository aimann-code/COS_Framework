CREATE TABLE meta.module (
  scope_id text NOT NULL REFERENCES meta.scope,
  module_code varchar(40) NOT NULL,
  name varchar(80) NOT NULL,
  route varchar(120) NOT NULL,
  audience varchar(160) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (scope_id, module_code)
);

CREATE TABLE people.leave_policy (
  policy_id uuid PRIMARY KEY,
  scope_id text NOT NULL REFERENCES meta.scope,
  code varchar(32) NOT NULL,
  name varchar(80) NOT NULL,
  paid boolean NOT NULL,
  annual_quota numeric(6,1) NOT NULL CHECK (annual_quota >= 0 AND annual_quota <= 366),
  notice_days integer NOT NULL CHECK (notice_days >= 0 AND notice_days <= 90),
  max_days integer NOT NULL CHECK (max_days BETWEEN 1 AND 366),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, code),
  UNIQUE (scope_id, policy_id)
);

CREATE TABLE people.leave_request (
  request_id uuid PRIMARY KEY,
  scope_id text NOT NULL REFERENCES meta.scope,
  employee_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  start_on date NOT NULL,
  end_on date NOT NULL,
  day_count numeric(6,1) NOT NULL CHECK (day_count > 0),
  reason varchar(500) NOT NULL,
  status text NOT NULL CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  version integer NOT NULL CHECK (version > 0),
  requested_by text NOT NULL,
  review_note varchar(500),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_on >= start_on),
  FOREIGN KEY (scope_id, employee_id) REFERENCES people.employee (scope_id, employee_id),
  FOREIGN KEY (scope_id, policy_id) REFERENCES people.leave_policy (scope_id, policy_id)
);
CREATE INDEX ix_leave_request_employee ON people.leave_request (scope_id, employee_id, start_on);
CREATE INDEX ix_leave_request_queue ON people.leave_request (scope_id, status, created_at);
