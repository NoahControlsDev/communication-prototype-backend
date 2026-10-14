-- Up Migration

CREATE TYPE unapproved_reason AS ENUM (
  'unknown_device',
  'gateway_mismatch',
  'unknown_property',
  'awaiting_review',
  'not_numeric'
);

CREATE TABLE unapproved_reading (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at        timestamptz NOT NULL DEFAULT now(),
  time               timestamptz NOT NULL,
  gateway_key        varchar NOT NULL,
  device_key         varchar NOT NULL,
  key                varchar NOT NULL,
  value              jsonb,
  reason             unapproved_reason NOT NULL,
  device_id          integer REFERENCES device (id) ON DELETE SET NULL,
  device_property_id integer REFERENCES device_property (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX unapproved_reading_point_idx ON unapproved_reading (gateway_key, device_key, key, time);
CREATE INDEX unapproved_reading_reason_idx ON unapproved_reading (reason);
CREATE INDEX unapproved_reading_device_id_idx ON unapproved_reading (device_id);
CREATE INDEX unapproved_reading_device_property_id_idx ON unapproved_reading (device_property_id);

-- Down Migration

DROP TABLE unapproved_reading;
DROP TYPE unapproved_reason;
