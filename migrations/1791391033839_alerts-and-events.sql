-- Up Migration

CREATE TYPE alert_severity AS ENUM ('critical', 'warning', 'offline');
CREATE TYPE alert_state AS ENUM ('active', 'acknowledged', 'resolved');

CREATE TABLE alert (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id          integer NOT NULL REFERENCES device (id) ON DELETE CASCADE,
  device_property_id integer REFERENCES device_property (id) ON DELETE CASCADE,
  kind               varchar NOT NULL,
  severity           alert_severity NOT NULL,
  title              varchar NOT NULL,
  message            text NOT NULL,
  state              alert_state NOT NULL DEFAULT 'active',
  raised_at          timestamptz NOT NULL DEFAULT now(),
  acknowledged_at    timestamptz,
  acknowledged_by    varchar,
  silenced_until     timestamptz,
  silenced_by        varchar,
  resolved_at        timestamptz,
  resolved_by        varchar,
  CONSTRAINT alert_kind_known CHECK (kind IN ('alarm', 'out_of_range', 'gateway_offline')),
  CONSTRAINT alert_resolved_has_time CHECK ((state = 'resolved') = (resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX alert_one_open_idx
  ON alert (device_id, kind, device_property_id) NULLS NOT DISTINCT
  WHERE state <> 'resolved';
CREATE INDEX alert_device_raised_idx ON alert (device_id, raised_at DESC);
CREATE INDEX alert_device_property_id_idx ON alert (device_property_id);

CREATE TABLE event (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  device_id   integer REFERENCES device (id) ON DELETE CASCADE,
  gateway_key varchar,
  kind        varchar NOT NULL,
  severity    varchar NOT NULL DEFAULT 'info',
  message     text NOT NULL,
  actor       varchar
);

CREATE INDEX event_device_occurred_idx ON event (device_id, occurred_at DESC);
CREATE INDEX event_gateway_occurred_idx ON event (gateway_key, occurred_at DESC);

ALTER TABLE device ADD COLUMN running boolean;

-- Down Migration

ALTER TABLE device DROP COLUMN running;

DROP TABLE event;
DROP TABLE alert;

DROP TYPE alert_state;
DROP TYPE alert_severity;
