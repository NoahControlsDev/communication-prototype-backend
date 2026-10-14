import pool from '../db/index.js'
import config from '../config/index.js'
import { HttpError } from '../utils/HttpError.js'

export const DATA_TOPIC = /^bas\/([^/]+)\/data$/

const AS_NUMBER = (v) => `CASE jsonb_typeof(${v})
    WHEN 'number'  THEN (${v} #>> '{}')::double precision
    WHEN 'boolean' THEN CASE WHEN (${v} #>> '{}') = 'true' THEN 1 ELSE 0 END
  END`
const IS_STORABLE = (v) => `jsonb_typeof(${v}) IN ('number', 'boolean', 'null')`
const QUALITY = (num, lo, hi) => `CASE WHEN ${num} IS NULL THEN NULL WHEN ${num} < ${lo} OR ${num} > ${hi} THEN 2 ELSE 0 END`

function flatten(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Data message must be a JSON object')
  }
  const { devices } = payload
  if (!devices || typeof devices !== 'object' || Array.isArray(devices)) {
    throw new HttpError(400, 'Data message needs a "devices" object: { "<device_key>": { "<key>": value } }')
  }

  let time = new Date()
  if (payload.timestamp !== undefined) {
    time = new Date(payload.timestamp)
    if (Number.isNaN(time.getTime())) throw new HttpError(400, `Invalid timestamp "${payload.timestamp}"`)
  }

  const deviceKeys = [], keys = [], values = []
  for (const [deviceKey, points] of Object.entries(devices)) {
    if (!points || typeof points !== 'object' || Array.isArray(points)) continue
    for (const [key, value] of Object.entries(points)) {
      deviceKeys.push(deviceKey)
      keys.push(key)
      values.push(JSON.stringify(value ?? null))
    }
  }
  return { time, deviceKeys, keys, values }
}

export async function ingestData(gatewayKey, payload) {
  const { time, deviceKeys, keys, values } = flatten(payload)
  if (!keys.length) return { time, stored: 0, duplicates: 0, dropped: 0, unapproved: {} }

  const { rows } = await pool.query(
    `WITH incoming AS (
       SELECT * FROM unnest($3::varchar[], $4::varchar[], $5::jsonb[]) AS t(device_key, key, value)
     ),
     classified AS (
       SELECT i.device_key, i.key, i.value, d.id AS device_id, dp.id AS device_property_id,
         ${AS_NUMBER('i.value')} AS num,
         coalesce(dp.min_override, pp.min) AS lo,
         coalesce(dp.max_override, pp.max) AS hi,
         CASE
           WHEN d.id IS NULL              THEN 'unknown_device'
           WHEN g.gateway_key <> $2       THEN 'gateway_mismatch'
           WHEN dp.id IS NULL             THEN 'unknown_property'
           WHEN NOT dp.approved           THEN 'awaiting_review'
           WHEN NOT ${IS_STORABLE('i.value')} THEN 'not_numeric'
         END AS reason,
         -- coalesce: with no certificate the comparison is NULL, which must mean "not declined"
         -- (a NULL here would match neither held nor dropped and the value would vanish)
         coalesce(
           EXISTS (SELECT 1 FROM declined_point x
                   WHERE x.gateway_key = $2 AND x.device_key = i.device_key AND (x.key IS NULL OR x.key = i.key))
           OR ((d.id IS NULL OR g.gateway_key <> $2) AND (
                 SELECT c.status FROM birth_certificate c
                 WHERE c.device_key = i.device_key AND c.gateway_key = $2
                 ORDER BY c.received_at DESC LIMIT 1) = 'declined'),
           false
         ) AS declined
       FROM incoming i
       LEFT JOIN device d            ON d.device_key = i.device_key
       LEFT JOIN gateway g           ON g.id = d.gateway_id
       LEFT JOIN device_property dp  ON dp.device_id = d.id AND dp.key = i.key
       LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
     ),
     stored AS (
       INSERT INTO reading (time, device_property_id, value, quality)
       SELECT $1, device_property_id, num, ${QUALITY('num', 'lo', 'hi')}
       FROM classified WHERE reason IS NULL
       ON CONFLICT (device_property_id, time) DO NOTHING  -- same message delivered twice
       RETURNING 1
     ),
     held AS (
       INSERT INTO unapproved_reading (time, gateway_key, device_key, key, value, reason, device_id, device_property_id)
       SELECT $1, $2, device_key, key, value, reason::unapproved_reason, device_id, device_property_id
       FROM classified WHERE reason IS NOT NULL AND NOT declined
       ON CONFLICT (gateway_key, device_key, key, time) DO NOTHING  -- delivered twice
       RETURNING reason
     )
     SELECT
       (SELECT count(*) FROM stored)::int AS stored,
       (SELECT count(*) FROM classified WHERE reason IS NULL)::int AS accepted,
       (SELECT count(*) FROM classified WHERE reason IS NOT NULL AND declined)::int AS dropped,
       (SELECT coalesce(jsonb_object_agg(reason, n), '{}') FROM
         (SELECT reason, count(*)::int AS n FROM held GROUP BY reason) x) AS unapproved`,
    [time, gatewayKey, deviceKeys, keys, values],
  )
  const r = rows[0]
  return { time, stored: r.stored, duplicates: r.accepted - r.stored, dropped: r.dropped, unapproved: r.unapproved }
}

export async function promoteUnapproved(db = pool) {
  const { rows } = await db.query(
    `WITH movable AS (
       SELECT u.id, u.time, dp.id AS device_property_id,
         ${AS_NUMBER('u.value')} AS num,
         coalesce(dp.min_override, pp.min) AS lo,
         coalesce(dp.max_override, pp.max) AS hi
       FROM unapproved_reading u
       JOIN device d            ON d.device_key = u.device_key
       JOIN gateway g           ON g.id = d.gateway_id AND g.gateway_key = u.gateway_key
       JOIN device_property dp  ON dp.device_id = d.id AND dp.key = u.key AND dp.approved
       LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
       WHERE ${IS_STORABLE('u.value')}
     ),
     stored AS (
       INSERT INTO reading (time, device_property_id, value, quality)
       SELECT time, device_property_id, num, ${QUALITY('num', 'lo', 'hi')}
       FROM movable
       ON CONFLICT (device_property_id, time) DO NOTHING
     ),
     removed AS (
       DELETE FROM unapproved_reading WHERE id IN (SELECT id FROM movable) RETURNING 1
     )
     SELECT count(*)::int AS promoted FROM removed`,
  )
  return rows[0].promoted
}

export async function latestReadings() {
  const { rows } = await pool.query(
    `SELECT g.gateway_key, g.status AS gateway_status, d.id AS device_id, d.device_key, d.name AS device_name,
       dp.id AS device_property_id, dp.key, pp.unit, pp.kind,
       coalesce(dp.min_override, pp.min) AS lo, coalesce(dp.max_override, pp.max) AS hi,
       lr.time, lr.value, lr.quality,
       (SELECT count(*)::int FROM reading r WHERE r.device_property_id = dp.id) AS reading_count
     FROM device_property dp
     JOIN device d ON d.id = dp.device_id
     JOIN gateway g ON g.id = d.gateway_id
     LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
     JOIN LATERAL (
       SELECT time, value, quality FROM reading r
       WHERE r.device_property_id = dp.id ORDER BY time DESC LIMIT 1
     ) lr ON true
     ORDER BY g.gateway_key, d.device_key, dp.key`,
  )
  return rows
}

export async function unapprovedSummary() {
  const { rows } = await pool.query(
    `SELECT gateway_key, device_key, key, reason,
       max(device_id) AS device_id,
       count(*)::int AS count,
       min(time) AS first_time, max(time) AS last_time,
       min(received_at) + make_interval(hours => $1) AS expires_at,
       (array_agg(value ORDER BY time DESC))[1] AS last_value
     FROM unapproved_reading
     GROUP BY gateway_key, device_key, key, reason
     ORDER BY gateway_key, device_key, key`,
    [config.unapprovedRetentionHours],
  )
  return { retention_hours: config.unapprovedRetentionHours, points: rows }
}

export async function purgeExpired() {
  const { rowCount } = await pool.query(
    'DELETE FROM unapproved_reading WHERE received_at < now() - make_interval(hours => $1)',
    [config.unapprovedRetentionHours],
  )
  return rowCount
}

export function startRetention() {
  const run = () => purgeExpired()
    .then((n) => { if (n) console.log(`Retention: deleted ${n} not-approved values older than ${config.unapprovedRetentionHours} h`) })
    .catch((err) => console.error('Retention failed:', err.message))
  run()
  setInterval(run, 10 * 60 * 1000).unref()
}

export async function declinePoint({ gateway_key, device_key, key = null }) {
  const { rows: [rule] } = await pool.query(
    `INSERT INTO declined_point (gateway_key, device_key, key) VALUES ($1, $2, $3)
     ON CONFLICT (gateway_key, device_key, key) DO UPDATE SET created_at = declined_point.created_at
     RETURNING *`,
    [gateway_key, device_key, key],
  )
  const { rowCount } = await pool.query(
    `DELETE FROM unapproved_reading
     WHERE gateway_key = $1 AND device_key = $2 AND ($3::varchar IS NULL OR key = $3)`,
    [gateway_key, device_key, key],
  )
  return { rule, deleted: rowCount }
}

export async function listDeclined() {
  const [rules, certs] = await Promise.all([
    pool.query('SELECT * FROM declined_point ORDER BY gateway_key, device_key, key NULLS FIRST'),
    pool.query(
      `SELECT DISTINCT ON (c.device_key, c.gateway_key) c.id, c.device_key, c.gateway_key, c.decided_at, c.status
       FROM birth_certificate c
       WHERE c.device_key IS NOT NULL AND c.gateway_key IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM device d JOIN gateway g ON g.id = d.gateway_id
                         WHERE d.device_key = c.device_key AND g.gateway_key = c.gateway_key)
       ORDER BY c.device_key, c.gateway_key, c.received_at DESC`,
    ),
  ])
  return { rules: rules.rows, certificates: certs.rows.filter((c) => c.status === 'declined') }
}

export async function undeclinePoint(id) {
  const { rowCount } = await pool.query('DELETE FROM declined_point WHERE id = $1', [id])
  return rowCount > 0
}

export async function deleteUnapproved(filters) {
  const conditions = [], params = []
  for (const col of ['gateway_key', 'device_key', 'key', 'reason']) {
    if (filters[col] != null) {
      params.push(filters[col])
      conditions.push(`${col} = $${params.length}${col === 'reason' ? '::unapproved_reason' : ''}`)
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rowCount } = await pool.query(`DELETE FROM unapproved_reading ${where}`, params)
  return rowCount
}

export const RANGES = {
  '15m': { interval: '15 minutes', seconds: 900 },
  '1h':  { interval: '1 hour',     seconds: 3600 },
  '6h':  { interval: '6 hours',    seconds: 21600 },
  '24h': { interval: '24 hours',   seconds: 86400 },
  '7d':  { interval: '7 days',     seconds: 604800 },
}
const bucketFor = (range, points) => `${Math.max(1, Math.ceil(RANGES[range].seconds / points))} seconds`

export async function propertyHistory(devicePropertyId, range = '1h', points = 300) {
  const { rows: [property] } = await pool.query(
    `SELECT dp.id, dp.key, dp.approved, d.id AS device_id, d.name AS device_name, d.device_key,
       pp.unit, pp.kind, pp.type,
       coalesce(dp.min_override, pp.min) AS lo, coalesce(dp.max_override, pp.max) AS hi
     FROM device_property dp
     JOIN device d ON d.id = dp.device_id
     LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
     WHERE dp.id = $1`,
    [devicePropertyId],
  )
  if (!property) return null

  const { rows } = await pool.query(
    `SELECT date_bin($3::interval, time, '2000-01-01') AS t,
       avg(value) AS v, min(value) AS min, max(value) AS max, max(quality) AS q, count(*)::int AS n
     FROM reading
     WHERE device_property_id = $1 AND time >= now() - $2::interval
     GROUP BY 1 ORDER BY 1`,
    [devicePropertyId, RANGES[range].interval, bucketFor(range, points)],
  )
  return { property, range, points: rows }
}

export async function deviceSeries(deviceId, range = '1h', points = 60) {
  const { rows } = await pool.query(
    `SELECT dp.id, dp.key, pp.unit, coalesce(dp.min_override, pp.min) AS lo, coalesce(dp.max_override, pp.max) AS hi,
       coalesce(json_agg(json_build_object('t', b.t, 'v', b.v, 'q', b.q) ORDER BY b.t)
         FILTER (WHERE b.t IS NOT NULL), '[]') AS points
     FROM device_property dp
     LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
     LEFT JOIN LATERAL (
       SELECT date_bin($3::interval, time, '2000-01-01') AS t, avg(value) AS v, max(quality) AS q
       FROM reading r
       WHERE r.device_property_id = dp.id AND r.time >= now() - $2::interval
       GROUP BY 1
     ) b ON true
     WHERE dp.device_id = $1 AND dp.approved
     GROUP BY dp.id, dp.key, pp.unit, lo, hi
     ORDER BY dp.key`,
    [deviceId, RANGES[range].interval, bucketFor(range, points)],
  )
  return rows
}

export async function ingestionStats(range = '1h', points = 60) {
  const { rows } = await pool.query(
    `SELECT date_bin($2::interval, ts, '2000-01-01') AS t,
       count(*) FILTER (WHERE kind = 'stored')::int AS stored,
       count(*) FILTER (WHERE kind = 'held')::int AS held
     FROM (
       SELECT time AS ts, 'stored' AS kind FROM reading WHERE time >= now() - $1::interval
       UNION ALL
       SELECT received_at, 'held' FROM unapproved_reading WHERE received_at >= now() - $1::interval
     ) x
     GROUP BY 1 ORDER BY 1`,
    [RANGES[range].interval, bucketFor(range, points)],
  )
  return { range, bucket_seconds: Math.ceil(RANGES[range].seconds / points), buckets: rows }
}
