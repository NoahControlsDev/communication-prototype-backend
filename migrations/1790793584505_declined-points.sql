-- Up Migration

-- Data an admin has declined: values matching a rule are dropped on arrival, never saved.
-- key NULL = the whole device. (A device whose birth certificate is declined is dropped
-- the same way; that's read from birth_certificate, not stored here.)
CREATE TABLE declined_point (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  gateway_key varchar NOT NULL,
  device_key  varchar NOT NULL,
  key         varchar,
  UNIQUE NULLS NOT DISTINCT (gateway_key, device_key, key)
);

-- Down Migration

DROP TABLE declined_point;
