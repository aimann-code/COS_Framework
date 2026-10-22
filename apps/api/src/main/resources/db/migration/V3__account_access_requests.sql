CREATE SCHEMA auth;
CREATE TABLE auth.account (
  account_id uuid PRIMARY KEY,
  scope_id text NOT NULL REFERENCES meta.scope,
  full_name varchar(100) NOT NULL,
  email varchar(254) NOT NULL,
  password_hash varchar(100) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REJECTED')),
  role text CHECK(role IN ('VIEWER','REGISTRAR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note varchar(500),
  UNIQUE(scope_id,email),
  CHECK(email=lower(email)),
  CHECK((status='PENDING' AND role IS NULL AND reviewed_by IS NULL) OR
        (status='ACTIVE' AND role IS NOT NULL AND reviewed_by IS NOT NULL) OR
        (status='REJECTED' AND role IS NULL AND reviewed_by IS NOT NULL))
);
CREATE INDEX ix_account_review ON auth.account(scope_id,status,created_at);
