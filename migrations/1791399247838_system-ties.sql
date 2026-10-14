-- Up Migration

ALTER TABLE device_connection
  ALTER COLUMN from_device_id DROP NOT NULL,
  ALTER COLUMN to_device_id DROP NOT NULL,
  ADD COLUMN from_system_id integer REFERENCES system (id) ON DELETE CASCADE,
  ADD COLUMN to_system_id integer REFERENCES system (id) ON DELETE CASCADE,
  DROP CONSTRAINT device_connection_from_device_id_to_device_id_key,
  ADD CONSTRAINT device_connection_from_one_end CHECK ((from_device_id IS NULL) <> (from_system_id IS NULL)),
  ADD CONSTRAINT device_connection_to_one_end CHECK ((to_device_id IS NULL) <> (to_system_id IS NULL)),
  ADD CONSTRAINT device_connection_has_device CHECK (from_device_id IS NOT NULL OR to_device_id IS NOT NULL);

CREATE UNIQUE INDEX device_connection_ends_idx
  ON device_connection (from_device_id, to_device_id, from_system_id, to_system_id) NULLS NOT DISTINCT;
CREATE INDEX device_connection_from_system_id_idx ON device_connection (from_system_id);
CREATE INDEX device_connection_to_system_id_idx ON device_connection (to_system_id);

-- Down Migration

DELETE FROM device_connection WHERE from_system_id IS NOT NULL OR to_system_id IS NOT NULL;

DROP INDEX device_connection_to_system_id_idx;
DROP INDEX device_connection_from_system_id_idx;
DROP INDEX device_connection_ends_idx;

ALTER TABLE device_connection
  DROP CONSTRAINT device_connection_has_device,
  DROP CONSTRAINT device_connection_to_one_end,
  DROP CONSTRAINT device_connection_from_one_end,
  DROP COLUMN to_system_id,
  DROP COLUMN from_system_id,
  ALTER COLUMN to_device_id SET NOT NULL,
  ALTER COLUMN from_device_id SET NOT NULL,
  ADD CONSTRAINT device_connection_from_device_id_to_device_id_key UNIQUE (from_device_id, to_device_id);
