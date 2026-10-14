-- Up Migration

ALTER TABLE device
  ADD COLUMN map_x integer,
  ADD COLUMN map_y integer,
  ADD CONSTRAINT device_map_position_both_or_neither CHECK ((map_x IS NULL) = (map_y IS NULL));

-- Down Migration

ALTER TABLE device
  DROP CONSTRAINT device_map_position_both_or_neither,
  DROP COLUMN map_y,
  DROP COLUMN map_x;
