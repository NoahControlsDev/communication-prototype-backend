-- Up Migration

CREATE TYPE command_status AS ENUM ('sent', 'applied', 'rejected', 'failed', 'timeout');

CREATE TABLE command (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id          integer NOT NULL REFERENCES device (id) ON DELETE CASCADE,
  device_property_id integer NOT NULL REFERENCES device_property (id) ON DELETE CASCADE,
  key                varchar NOT NULL,
  value              double precision NOT NULL,
  requested_by       varchar NOT NULL,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  status             command_status NOT NULL DEFAULT 'sent',
  result_at          timestamptz,
  reason             text
);

CREATE INDEX command_device_requested_idx ON command (device_id, requested_at DESC);
CREATE INDEX command_device_property_id_idx ON command (device_property_id);

-- Down Migration

DROP TABLE command;
DROP TYPE command_status;
