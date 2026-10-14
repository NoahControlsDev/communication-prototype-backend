-- Up Migration

ALTER TABLE gateway
  ADD COLUMN status    varchar CHECK (status IN ('online', 'offline')),
  ADD COLUMN status_at timestamptz;

-- Down Migration

ALTER TABLE gateway
  DROP COLUMN status_at,
  DROP COLUMN status;
