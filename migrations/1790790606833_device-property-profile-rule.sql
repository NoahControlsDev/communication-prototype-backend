-- Up Migration

-- A device property generated from the class must come from the device's OWN profile:
-- device_property.profile_property_id → profile_property.profile_id = device.profile_id.
-- Spans three tables, so it's enforced with triggers.

CREATE FUNCTION device_property_check_profile() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.profile_property_id IS NULL THEN
    RETURN NEW; -- extension
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM device d JOIN profile_property pp ON pp.profile_id = d.profile_id
    WHERE d.id = NEW.device_id AND pp.id = NEW.profile_property_id
  ) THEN
    RAISE EXCEPTION 'profile_property % does not belong to the profile of device %',
      NEW.profile_property_id, NEW.device_id USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER device_property_check_profile
  BEFORE INSERT OR UPDATE OF device_id, profile_property_id ON device_property
  FOR EACH ROW EXECUTE FUNCTION device_property_check_profile();

-- The other direction: a device can't switch profile while it has standard
-- properties generated from the old one.
CREATE FUNCTION device_check_profile_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM device_property dp JOIN profile_property pp ON pp.id = dp.profile_property_id
    WHERE dp.device_id = NEW.id AND pp.profile_id <> NEW.profile_id
  ) THEN
    RAISE EXCEPTION 'device % still has properties from its previous profile', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER device_check_profile_change
  AFTER UPDATE OF profile_id ON device
  FOR EACH ROW EXECUTE FUNCTION device_check_profile_change();

-- Down Migration

DROP TRIGGER device_check_profile_change ON device;
DROP FUNCTION device_check_profile_change();
DROP TRIGGER device_property_check_profile ON device_property;
DROP FUNCTION device_property_check_profile();
