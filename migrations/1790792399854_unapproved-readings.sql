-- Up Migration

-- Values that arrive on bas/<GATEWAY_ID>/data but can't go into `reading` yet.
-- Kept (not dropped) so nothing is lost while an admin reviews: once the device /
-- property is approved, matching rows are promoted into `reading`.

CREATE TYPE unapproved_reason AS ENUM (
  'unknown_device',     -- no device with this device_key
  'gateway_mismatch',   -- device exists, but is registered under another gateway
  'unknown_property',   -- device exists, property key isn't on it
  'awaiting_review',    -- property exists but approved = false (§2.1)
  'not_numeric'         -- value isn't a number / bool / null, so it can't be a reading
);

CREATE TABLE unapproved_reading (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at        timestamptz NOT NULL DEFAULT now(),
  time               timestamptz NOT NULL,          -- timestamp from the gateway
  gateway_key        varchar NOT NULL,
  device_key         varchar NOT NULL,
  key                varchar NOT NULL,
  value              jsonb,                         -- raw value as sent
  reason             unapproved_reason NOT NULL,
  device_id          integer REFERENCES device (id) ON DELETE SET NULL,
  device_property_id integer REFERENCES device_property (id) ON DELETE SET NULL
);

-- One value per point and timestamp: a message delivered twice (MQTT QoS 1 can do that)
-- is stored once, the same guarantee `reading` gets from its primary key.
CREATE UNIQUE INDEX unapproved_reading_point_idx ON unapproved_reading (gateway_key, device_key, key, time);
CREATE INDEX unapproved_reading_reason_idx ON unapproved_reading (reason);
CREATE INDEX unapproved_reading_device_id_idx ON unapproved_reading (device_id);
CREATE INDEX unapproved_reading_device_property_id_idx ON unapproved_reading (device_property_id);

-- Down Migration

DROP TABLE unapproved_reading;
DROP TYPE unapproved_reason;
