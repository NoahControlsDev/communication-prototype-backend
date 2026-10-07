-- Up Migration

-- A profile is a pre-approved device type: a birth certificate declaring it (and meeting
-- its contract) is accepted instantly, creating a new device instance with no review.
ALTER TABLE profile
  ADD COLUMN auto_accept boolean NOT NULL DEFAULT true;

ALTER TABLE birth_certificate
  ADD COLUMN auto_accepted boolean NOT NULL DEFAULT false,  -- accepted by the type match, not an admin
  ADD COLUMN review_reason text;                           -- why a pending certificate wasn't auto-accepted

-- Down Migration

ALTER TABLE birth_certificate
  DROP COLUMN review_reason,
  DROP COLUMN auto_accepted;

ALTER TABLE profile
  DROP COLUMN auto_accept;
