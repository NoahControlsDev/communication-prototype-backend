-- Up Migration

-- Time-range queries across all properties (ingestion stats, "last hour") filter on
-- reading.time alone, which the (device_property_id, time) primary key can't serve.
-- (If reading becomes a TimescaleDB hypertable later, it creates its own time index.)
CREATE INDEX reading_time_idx ON reading (time);
CREATE INDEX unapproved_reading_received_at_idx ON unapproved_reading (received_at);

-- Down Migration

DROP INDEX unapproved_reading_received_at_idx;
DROP INDEX reading_time_idx;
