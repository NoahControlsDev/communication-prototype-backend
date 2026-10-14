-- Up Migration

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
