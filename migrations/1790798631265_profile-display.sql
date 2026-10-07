-- Up Migration

-- How the plant mimic draws devices of this type. Config, not code:
--   { "glyph": "pump" | "vessel" | "fanbox" | "generic",
--     "run": "<property key>",                    -- which property means running
--     "when": { "op": "gt" | "eq" | "ne", "value": 0 },
--     "readouts": ["<key>", "<key>"] }            -- up to two values shown under the glyph
-- NULL = generic glyph, first two properties as readouts, running unknown.
ALTER TABLE profile ADD COLUMN display jsonb;

-- Down Migration

ALTER TABLE profile DROP COLUMN display;
