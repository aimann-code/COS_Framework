ALTER TABLE commerce.configuration_request DROP CONSTRAINT configuration_request_kind_check;
ALTER TABLE commerce.configuration_request ADD CONSTRAINT configuration_request_kind_check
 CHECK (kind IN ('FIELD_ADD','FIELD_UPDATE'));
ALTER TABLE commerce.configuration_request
 ADD COLUMN base_schema_version integer NOT NULL DEFAULT 1 CHECK (base_schema_version > 0);

CREATE TABLE commerce.service_schema (
  scope_id text NOT NULL REFERENCES meta.scope,
  service_code text NOT NULL REFERENCES commerce.service_descriptor,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (scope_id,service_code)
);
INSERT INTO commerce.service_schema(scope_id,service_code,version)
 SELECT e.scope_id,e.service_code,
  1+(SELECT count(*) FROM commerce.service_field f
    WHERE f.scope_id=e.scope_id AND f.service_code=e.service_code)
 FROM commerce.entitlement e;

ALTER TABLE commerce.service_field ADD COLUMN configuration jsonb;
UPDATE commerce.service_field s SET configuration=jsonb_build_object(
 'technical_name',f.technical_name,'label',f.label,'data_type',f.data_type,'sensitive',f.sensitive)
 FROM meta.field_definition f WHERE f.field_id=s.field_id;
ALTER TABLE commerce.service_field ALTER COLUMN configuration SET NOT NULL;
