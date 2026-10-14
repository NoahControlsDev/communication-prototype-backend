-- Up Migration

ALTER TABLE profile
  ADD COLUMN auto_accept boolean NOT NULL DEFAULT true;

ALTER TABLE birth_certificate
  ADD COLUMN auto_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN review_reason text;

-- Down Migration

ALTER TABLE birth_certificate
  DROP COLUMN review_reason,
  DROP COLUMN auto_accepted;

ALTER TABLE profile
  DROP COLUMN auto_accept;
