-- Up Migration

-- Enums ----------------------------------------------------------------------

CREATE TYPE property_kind AS ENUM ('measure', 'command', 'status', 'alarm', 'counter');
CREATE TYPE aggregation   AS ENUM ('instant', 'average');
CREATE TYPE acquisition   AS ENUM ('interval', 'cov');
-- pending = birth certificate received, not yet placed (§1.6)
CREATE TYPE device_status AS ENUM ('pending', 'commissioned');

-- Functional tree / infrastructure --------------------------------------------

-- Parent of device in the functional tree (§1.5). Rest of the hierarchy omitted.
CREATE TABLE system (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar                                            -- e.g. 06 Heating
);

-- Not a hierarchy level: an attribute of the device (§1.6).
CREATE TABLE gateway (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gateway_key varchar NOT NULL UNIQUE                     -- GATEWAY_ID (§5.6)
);

-- Profiles (device classes) ----------------------------------------------------

-- Written as vfd-pump@1.0. Minor = optional properties added;
-- major = rename, remove or unit change (§2.1).
CREATE TABLE profile (
  id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key   varchar NOT NULL,                                 -- e.g. vfd-pump
  major integer NOT NULL,
  minor integer NOT NULL,
  UNIQUE (key, major, minor)
);

CREATE TABLE profile_property (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id    integer NOT NULL REFERENCES profile (id),
  key           varchar NOT NULL,                         -- e.g. running, speed
  kind          property_kind NOT NULL,                   -- §2.2
  type          varchar NOT NULL,                         -- bool / float ... (§1.1)
  unit          varchar,                                  -- declared here only; never overridden per device (§1.1)
  min           double precision,
  max           double precision,
  aggregation   aggregation,                              -- §2.2
  derived       boolean,                                  -- §2.2
  formula       text,                                     -- §2.2
  acquisition   acquisition,                              -- §2.2
  deadband      double precision,                         -- declared beside acquisition (§5.5)
  writable      boolean NOT NULL,                         -- §1.1
  priority      varchar,                                  -- ISA-18.2, alarms only (§2.2)
  enum_map      jsonb,                                    -- §2.2
  required      boolean NOT NULL,                         -- required = contract (§2.1)
  haystack_tags text[],                                   -- §1.4
  UNIQUE (profile_id, key)
);

-- Devices ------------------------------------------------------------------------

CREATE TABLE device (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_key varchar NOT NULL UNIQUE,                     -- stable opaque key from the gateway (§1.2)
  name       varchar NOT NULL,                            -- mutable label, e.g. Pump 9A
  site_tag   varchar,                                     -- display only, e.g. P09A
  system_id  integer REFERENCES system (id),              -- null while pending
  gateway_id integer NOT NULL REFERENCES gateway (id),
  profile_id integer NOT NULL REFERENCES profile (id),    -- class declared in the birth certificate
  status     device_status NOT NULL
);

-- Generated from the class when a birth certificate arrives.
-- Override columns are empty on most rows (§1.1).
CREATE TABLE device_property (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id           integer NOT NULL REFERENCES device (id),
  profile_property_id integer REFERENCES profile_property (id), -- null for an extension
  key                 varchar NOT NULL,
  is_standard         boolean NOT NULL,                   -- false = extension (§2.1)
  approved            boolean NOT NULL,                   -- false = unknown property awaiting review (§2.1)
  min_override        double precision,                   -- narrow only
  max_override        double precision,                   -- narrow only
  writable_override   boolean,                            -- may only drop to read-only
  UNIQUE (device_id, key)
);

-- Time series ------------------------------------------------------------------

-- (device_property_id, time) is unique and never null, so it serves as the primary key.
CREATE TABLE reading (
  time               timestamptz NOT NULL,
  device_property_id integer NOT NULL REFERENCES device_property (id),
  value              double precision,
  quality            smallint,                            -- 0 good, 2 outside declared range
  PRIMARY KEY (device_property_id, time)
);

-- Postgres doesn't index foreign keys automatically. These cover the ones not
-- already leading a unique/primary key index, so joins and deletes stay fast.
CREATE INDEX device_system_id_idx                    ON device (system_id);
CREATE INDEX device_gateway_id_idx                   ON device (gateway_id);
CREATE INDEX device_profile_id_idx                   ON device (profile_id);
CREATE INDEX device_property_profile_property_id_idx ON device_property (profile_property_id);

-- Down Migration

DROP TABLE reading;
DROP TABLE device_property;
DROP TABLE device;
DROP TABLE profile_property;
DROP TABLE profile;
DROP TABLE gateway;
DROP TABLE system;

DROP TYPE device_status;
DROP TYPE acquisition;
DROP TYPE aggregation;
DROP TYPE property_kind;
