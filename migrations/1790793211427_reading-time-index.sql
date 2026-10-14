-- Up Migration

CREATE INDEX reading_time_idx ON reading (time);
CREATE INDEX unapproved_reading_received_at_idx ON unapproved_reading (received_at);

-- Down Migration

DROP INDEX unapproved_reading_received_at_idx;
DROP INDEX reading_time_idx;
