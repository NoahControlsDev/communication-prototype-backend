-- Up Migration

CREATE TABLE device_connection (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_device_id integer NOT NULL REFERENCES device (id) ON DELETE CASCADE,
  to_device_id   integer NOT NULL REFERENCES device (id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_device_id, to_device_id),
  CONSTRAINT device_connection_not_to_itself CHECK (from_device_id <> to_device_id)
);

CREATE INDEX device_connection_to_device_id_idx ON device_connection (to_device_id);

-- Down Migration

DROP TABLE device_connection;
