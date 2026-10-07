-- Up Migration

-- Birth certificates (§1.6): a device announcing itself and the fields it reports.
-- Stored for review; nothing is created until an admin accepts one.

CREATE TYPE certificate_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE birth_certificate (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at      timestamptz NOT NULL DEFAULT now(),
  topic            text,                          -- MQTT topic, null when submitted by hand
  device_key       varchar,                       -- may be missing; filled in on accept
  gateway_key      varchar,                       -- GATEWAY_ID (§5.6)
  declared_profile varchar,                       -- class declared by the device, e.g. vfd-pump@1.0
  name             varchar,
  site_tag         varchar,
  fields           jsonb NOT NULL,                -- normalised: [{ "key": ..., "type"?: ..., ... }]
  payload          jsonb NOT NULL,                -- the message exactly as received
  status           certificate_status NOT NULL DEFAULT 'pending',
  decided_at       timestamptz,
  device_id        integer REFERENCES device (id) ON DELETE SET NULL,   -- device created or updated on accept
  profile_id       integer REFERENCES profile (id) ON DELETE SET NULL,  -- profile used on accept
  CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE INDEX birth_certificate_status_idx     ON birth_certificate (status, received_at DESC);
CREATE INDEX birth_certificate_device_key_idx ON birth_certificate (device_key);

-- At most one pending certificate per device (and gateway). A device re-announcing
-- itself updates that row, even if two backend instances receive the same message.
CREATE UNIQUE INDEX birth_certificate_one_pending_idx
  ON birth_certificate (device_key, gateway_key) NULLS NOT DISTINCT
  WHERE status = 'pending' AND device_key IS NOT NULL;
CREATE INDEX birth_certificate_device_id_idx  ON birth_certificate (device_id);
CREATE INDEX birth_certificate_profile_id_idx ON birth_certificate (profile_id);

-- Down Migration

DROP TABLE birth_certificate;
DROP TYPE certificate_status;
