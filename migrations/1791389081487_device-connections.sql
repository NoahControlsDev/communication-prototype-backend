-- Up Migration

-- Pipes drawn on the Plant page's system map: one device's supply into another's return.
-- Where a device sits on the map is automatic (by its system); only these links are
-- entered by a person. Display information: nothing in ingestion depends on it.
CREATE TABLE device_connection (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_device_id integer NOT NULL REFERENCES device (id) ON DELETE CASCADE,  -- supply side
  to_device_id   integer NOT NULL REFERENCES device (id) ON DELETE CASCADE,  -- return side
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_device_id, to_device_id),
  CONSTRAINT device_connection_not_to_itself CHECK (from_device_id <> to_device_id)
);

CREATE INDEX device_connection_to_device_id_idx ON device_connection (to_device_id);

-- Down Migration

DROP TABLE device_connection;
