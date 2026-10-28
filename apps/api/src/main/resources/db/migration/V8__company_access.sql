CREATE TABLE auth.company_request (
  request_id uuid PRIMARY KEY,
  readable_id text NOT NULL UNIQUE,
  company_name varchar(80) NOT NULL,
  login_email varchar(254) NOT NULL,
  password_hash varchar(100) NOT NULL,
  requested_modules text NOT NULL,
  granted_modules text,
  scope_id text REFERENCES meta.scope,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by text,
  remarks varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (login_email = lower(login_email)),
  CHECK (
    (status = 'PENDING' AND scope_id IS NULL AND granted_modules IS NULL AND reviewed_by IS NULL)
    OR (status = 'APPROVED' AND scope_id IS NOT NULL AND granted_modules IS NOT NULL AND reviewed_by IS NOT NULL)
    OR (status = 'REJECTED' AND scope_id IS NULL AND granted_modules IS NULL AND reviewed_by IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_company_request_open_email
  ON auth.company_request (login_email)
  WHERE status IN ('PENDING', 'APPROVED');
CREATE INDEX ix_company_request_status ON auth.company_request (status, created_at);
