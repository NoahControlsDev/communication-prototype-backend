-- Up Migration

CREATE TYPE certificate_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE birth_certificate (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at      timestamptz NOT NULL DEFAULT now(),
  topic            text,
  device_key       varchar,
  gateway_key      varchar,
  declared_profile varchar,
  name             varchar,
  site_tag         varchar,
  fields           jsonb NOT NULL,
  payload          jsonb NOT NULL,
  status           certificate_status NOT NULL DEFAULT 'pending',
  decided_at       timestamptz,
  device_id        integer REFERENCES device (id) ON DELETE SET NULL,
  profile_id       integer REFERENCES profile (id) ON DELETE SET NULL,
  CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE INDEX birth_certificate_status_idx     ON birth_certificate (status, received_at DESC);
CREATE INDEX birth_certificate_device_key_idx ON birth_certificate (device_key);

CREATE UNIQUE INDEX birth_certificate_one_pending_idx
  ON birth_certificate (device_key, gateway_key) NULLS NOT DISTINCT
  WHERE status = 'pending' AND device_key IS NOT NULL;
CREATE INDEX birth_certificate_device_id_idx  ON birth_certificate (device_id);
CREATE INDEX birth_certificate_profile_id_idx ON birth_certificate (profile_id);

-- Down Migration

DROP TABLE birth_certificate;
DROP TYPE certificate_status;
