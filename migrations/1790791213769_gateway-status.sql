-- Up Migration

-- Connection state from bas/<GATEWAY_ID>/status: "online" is the gateway's birth
-- message, "offline" its Last Will (or a clean disconnect). Lets an offline gateway
-- be told apart from a device genuinely reporting zero.
ALTER TABLE gateway
  ADD COLUMN status    varchar CHECK (status IN ('online', 'offline')),  -- null = never heard from
  ADD COLUMN status_at timestamptz;

-- Down Migration

ALTER TABLE gateway
  DROP COLUMN status_at,
  DROP COLUMN status;
