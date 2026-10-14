-- Up Migration

ALTER TABLE profile ADD COLUMN display jsonb;

-- Down Migration

ALTER TABLE profile DROP COLUMN display;
