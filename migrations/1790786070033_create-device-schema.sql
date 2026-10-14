-- Up Migration

CREATE TYPE property_kind AS ENUM ('measure', 'command', 'status', 'alarm', 'counter');
CREATE TYPE aggregation   AS ENUM ('instant', 'average');
CREATE TYPE acquisition   AS ENUM ('interval', 'cov');
CREATE TYPE device_status AS ENUM ('pending', 'commissioned');

CREATE TABLE system (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar
);

CREATE TABLE gateway (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gateway_key varchar NOT NULL UNIQUE
);

CREATE TABLE profile (
  id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key   varchar NOT NULL,
  major integer NOT NULL,
  minor integer NOT NULL,
  UNIQUE (key, major, minor)
);

CREATE TABLE profile_property (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id    integer NOT NULL REFERENCES profile (id),
  key           varchar NOT NULL,
  kind          property_kind NOT NULL,
  type          varchar NOT NULL,
  unit          varchar,
  min           double precision,
  max           double precision,
  aggregation   aggregation,
  derived       boolean,
  formula       text,
  acquisition   acquisition,
  deadband      double precision,
  writable      boolean NOT NULL,
  priority      varchar,
  enum_map      jsonb,
  required      boolean NOT NULL,
  haystack_tags text[],
  UNIQUE (profile_id, key)
);

CREATE TABLE device (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_key varchar NOT NULL UNIQUE,
  name       varchar NOT NULL,
  site_tag   varchar,
  system_id  integer REFERENCES system (id),
  gateway_id integer NOT NULL REFERENCES gateway (id),
  profile_id integer NOT NULL REFERENCES profile (id),
  status     device_status NOT NULL
);

CREATE TABLE device_property (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id           integer NOT NULL REFERENCES device (id),
  profile_property_id integer REFERENCES profile_property (id),
  key                 varchar NOT NULL,
  is_standard         boolean NOT NULL,
  approved            boolean NOT NULL,
  min_override        double precision,
  max_override        double precision,
  writable_override   boolean,
  UNIQUE (device_id, key)
);

CREATE TABLE reading (
  time               timestamptz NOT NULL,
  device_property_id integer NOT NULL REFERENCES device_property (id),
  value              double precision,
  quality            smallint,
  PRIMARY KEY (device_property_id, time)
);

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
