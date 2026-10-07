-- Up Migration

-- Cascading deletes ------------------------------------------------------------
-- Deleting a parent removes the rows that belong to it:
--   device           → its device_property rows → their readings
--   profile          → its profile_property rows
--   profile_property → the device_property rows generated from it → their readings
-- device.system_id / gateway_id / profile_id are left as-is (deletion blocked while
-- devices reference them), so removing a system, gateway or profile can't silently
-- wipe out devices.

ALTER TABLE device_property
  DROP CONSTRAINT device_property_device_id_fkey,
  ADD CONSTRAINT device_property_device_id_fkey
    FOREIGN KEY (device_id) REFERENCES device (id) ON DELETE CASCADE,
  DROP CONSTRAINT device_property_profile_property_id_fkey,
  ADD CONSTRAINT device_property_profile_property_id_fkey
    FOREIGN KEY (profile_property_id) REFERENCES profile_property (id) ON DELETE CASCADE;

ALTER TABLE reading
  DROP CONSTRAINT reading_device_property_id_fkey,
  ADD CONSTRAINT reading_device_property_id_fkey
    FOREIGN KEY (device_property_id) REFERENCES device_property (id) ON DELETE CASCADE;

ALTER TABLE profile_property
  DROP CONSTRAINT profile_property_profile_id_fkey,
  ADD CONSTRAINT profile_property_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profile (id) ON DELETE CASCADE;

-- Single-row checks ----------------------------------------------------------------

ALTER TABLE profile_property
  ADD CONSTRAINT profile_property_min_le_max
    CHECK (min IS NULL OR max IS NULL OR min <= max),
  -- ISA-18.2, alarms only (§2.2)
  ADD CONSTRAINT profile_property_priority_alarms_only
    CHECK (priority IS NULL OR kind = 'alarm');

-- null while pending; a commissioned device has been placed in a system (§1.6)
ALTER TABLE device
  ADD CONSTRAINT device_system_matches_status
    CHECK ((status = 'pending') = (system_id IS NULL));

ALTER TABLE device_property
  -- false = extension, and an extension has no profile_property (§2.1)
  ADD CONSTRAINT device_property_standard_has_profile_property
    CHECK (is_standard = (profile_property_id IS NOT NULL)),
  ADD CONSTRAINT device_property_min_override_le_max_override
    CHECK (min_override IS NULL OR max_override IS NULL OR min_override <= max_override),
  -- may only drop to read-only
  ADD CONSTRAINT device_property_writable_override_read_only
    CHECK (writable_override IS NULL OR writable_override = false);

-- Narrow-only overrides (§1.1) -------------------------------------------------------
-- A device's min/max override may only tighten the range declared on its
-- profile_property. That compares two tables, so it needs triggers rather than CHECKs.

CREATE FUNCTION device_property_check_overrides() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  declared_min double precision;
  declared_max double precision;
BEGIN
  IF NEW.profile_property_id IS NULL THEN
    RETURN NEW; -- extension: no declared range to narrow
  END IF;

  SELECT min, max INTO declared_min, declared_max
  FROM profile_property WHERE id = NEW.profile_property_id;

  IF NEW.min_override < declared_min THEN
    RAISE EXCEPTION 'min_override % widens declared min % (overrides may only narrow)',
      NEW.min_override, declared_min USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.max_override > declared_max THEN
    RAISE EXCEPTION 'max_override % widens declared max % (overrides may only narrow)',
      NEW.max_override, declared_max USING ERRCODE = 'check_violation';
  END IF;

  -- e.g. declared 0..100 with max_override -5 would leave an empty range
  IF COALESCE(NEW.min_override, declared_min) > COALESCE(NEW.max_override, declared_max) THEN
    RAISE EXCEPTION 'overrides leave an empty range (% > %)',
      COALESCE(NEW.min_override, declared_min), COALESCE(NEW.max_override, declared_max)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER device_property_check_overrides
  BEFORE INSERT OR UPDATE OF profile_property_id, min_override, max_override ON device_property
  FOR EACH ROW EXECUTE FUNCTION device_property_check_overrides();

-- The other direction: tightening a profile's declared range must not leave
-- existing device overrides outside it.
CREATE FUNCTION profile_property_check_overrides() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM device_property dp
    WHERE dp.profile_property_id = NEW.id
      AND (dp.min_override < NEW.min
        OR dp.max_override > NEW.max
        OR COALESCE(dp.min_override, NEW.min) > COALESCE(dp.max_override, NEW.max))
  ) THEN
    RAISE EXCEPTION 'new range for profile_property % conflicts with existing device overrides', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER profile_property_check_overrides
  AFTER UPDATE OF min, max ON profile_property
  FOR EACH ROW EXECUTE FUNCTION profile_property_check_overrides();

-- Remove the prototype messages table --------------------------------------------

DROP TABLE IF EXISTS messages;

-- Down Migration

CREATE TABLE messages (
  id         SERIAL PRIMARY KEY,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER profile_property_check_overrides ON profile_property;
DROP FUNCTION profile_property_check_overrides();
DROP TRIGGER device_property_check_overrides ON device_property;
DROP FUNCTION device_property_check_overrides();

ALTER TABLE device_property
  DROP CONSTRAINT device_property_writable_override_read_only,
  DROP CONSTRAINT device_property_min_override_le_max_override,
  DROP CONSTRAINT device_property_standard_has_profile_property;

ALTER TABLE device
  DROP CONSTRAINT device_system_matches_status;

ALTER TABLE profile_property
  DROP CONSTRAINT profile_property_priority_alarms_only,
  DROP CONSTRAINT profile_property_min_le_max;

ALTER TABLE profile_property
  DROP CONSTRAINT profile_property_profile_id_fkey,
  ADD CONSTRAINT profile_property_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profile (id);

ALTER TABLE reading
  DROP CONSTRAINT reading_device_property_id_fkey,
  ADD CONSTRAINT reading_device_property_id_fkey
    FOREIGN KEY (device_property_id) REFERENCES device_property (id);

ALTER TABLE device_property
  DROP CONSTRAINT device_property_device_id_fkey,
  ADD CONSTRAINT device_property_device_id_fkey
    FOREIGN KEY (device_id) REFERENCES device (id),
  DROP CONSTRAINT device_property_profile_property_id_fkey,
  ADD CONSTRAINT device_property_profile_property_id_fkey
    FOREIGN KEY (profile_property_id) REFERENCES profile_property (id);
