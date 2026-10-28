ALTER TABLE people.employee
  ADD COLUMN work_email varchar(254),
  ADD COLUMN work_email_status text NOT NULL DEFAULT 'PROVISIONED'
    CHECK (work_email_status IN ('RESERVED', 'IMPORTED', 'PROVISIONED', 'REUSED', 'FAILED'));

CREATE UNIQUE INDEX uq_employee_work_email
  ON people.employee (scope_id, lower(work_email))
  WHERE work_email IS NOT NULL;
