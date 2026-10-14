import pool from '../db/index.js'
import { HttpError } from '../utils/HttpError.js'

const OFFLINE_GRACE_MS = 30_000
const DEFAULT_SILENCE_MINUTES = 60

const CONDITIONS = `
  WITH latest AS (
    SELECT d.id AS device_id, d.name, dp.id AS dpid, dp.key, pp.kind, pp.unit, lr.value, lr.quality
    FROM device d
    JOIN gateway g ON g.id = d.gateway_id
    JOIN device_property dp ON dp.device_id = d.id
    LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
    JOIN LATERAL (
      SELECT value, quality FROM reading r
      WHERE r.device_property_id = dp.id ORDER BY time DESC LIMIT 1
    ) lr ON true
    WHERE g.gateway_key = $1
  ), cond AS (
    SELECT device_id, dpid, 'alarm' AS kind, 'critical'::alert_severity AS severity,
      name || ' ' || key AS title, key || ' is active.' AS message
    FROM latest WHERE kind = 'alarm' AND value > 0
    UNION ALL
    SELECT device_id, dpid, 'out_of_range', 'warning'::alert_severity,
      name || ' ' || key, key || ' is outside its range (' || value || coalesce(' ' || unit, '') || ').'
    FROM latest WHERE quality = 2
  )`

const GATEWAY_DEVICES = `
  SELECT d.id FROM device d JOIN gateway g ON g.id = d.gateway_id WHERE g.gateway_key = $1`

const RUN_RULES = {
  gt: (v, x) => v > x,
  eq: (v, x) => v === x,
  ne: (v, x) => v !== x,
}

export async function addEvent({ deviceId = null, gatewayKey = null, kind, severity = 'info', message, actor = null }) {
  await pool.query(
    `INSERT INTO event (device_id, gateway_key, kind, severity, message, actor)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [deviceId, gatewayKey, kind, severity, message, actor],
  )
}

async function trackRunning(gatewayKey) {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.running, p.display,
       (SELECT r.value FROM device_property dp
        JOIN reading r ON r.device_property_id = dp.id
        WHERE dp.device_id = d.id AND dp.key = p.display->>'run'
        ORDER BY r.time DESC LIMIT 1) AS run_value
     FROM device d
     JOIN gateway g ON g.id = d.gateway_id
     JOIN profile p ON p.id = d.profile_id
     WHERE g.gateway_key = $1 AND p.display->>'run' IS NOT NULL`,
    [gatewayKey],
  )
  for (const row of rows) {
    if (row.run_value === null) continue
    const { op = 'gt', value = 0 } = row.display.when ?? {}
    const running = (RUN_RULES[op] ?? RUN_RULES.gt)(Number(row.run_value), Number(value))
    if (running === row.running) continue
    await pool.query('UPDATE device SET running = $2 WHERE id = $1', [row.id, running])
    if (row.running === null) continue
    await addEvent({
      deviceId: row.id,
      kind: 'state',
      message: `${row.name} changed from ${running ? 'stopped to running' : 'running to stopped'}.`,
    })
  }
}

export async function evaluateGateway(gatewayKey) {
  const raised = await pool.query(
    `${CONDITIONS}
     INSERT INTO alert (device_id, device_property_id, kind, severity, title, message)
     SELECT device_id, dpid, kind, severity, title, message FROM cond
     ON CONFLICT (device_id, kind, device_property_id) WHERE state <> 'resolved' DO NOTHING
     RETURNING device_id, title, message, severity`,
    [gatewayKey],
  )
  for (const a of raised.rows) {
    await addEvent({ deviceId: a.device_id, kind: 'alert', severity: a.severity, message: `Alert raised: ${a.title}. ${a.message}` })
  }

  const resolved = await pool.query(
    `${CONDITIONS}
     UPDATE alert a SET state = 'resolved', resolved_at = now()
     WHERE a.state <> 'resolved' AND a.kind IN ('alarm', 'out_of_range')
       AND a.device_id IN (${GATEWAY_DEVICES})
       AND NOT EXISTS (
         SELECT 1 FROM cond c
         WHERE c.device_id = a.device_id AND c.dpid = a.device_property_id AND c.kind = a.kind
       )
     RETURNING a.device_id, a.title`,
    [gatewayKey],
  )
  for (const a of resolved.rows) {
    await addEvent({ deviceId: a.device_id, kind: 'alert', message: `Alert resolved: ${a.title} returned to normal.` })
  }

  await trackRunning(gatewayKey)
  return { raised: raised.rowCount, resolved: resolved.rowCount }
}

async function raiseOffline(gatewayKey) {
  const { rows: [gateway] } = await pool.query(
    `SELECT status FROM gateway
     WHERE gateway_key = $1 AND status = 'offline' AND status_at <= now() - make_interval(secs => $2)`,
    [gatewayKey, OFFLINE_GRACE_MS / 1000 - 1],
  )
  if (!gateway) return
  const { rowCount } = await pool.query(
    `INSERT INTO alert (device_id, device_property_id, kind, severity, title, message)
     SELECT d.id, NULL, 'gateway_offline', 'offline', d.name || ' offline',
       'Gateway ' || g.gateway_key || ' is offline; values are not arriving.'
     FROM device d JOIN gateway g ON g.id = d.gateway_id
     WHERE g.gateway_key = $1
     ON CONFLICT (device_id, kind, device_property_id) WHERE state <> 'resolved' DO NOTHING`,
    [gatewayKey],
  )
  if (rowCount) {
    await addEvent({ gatewayKey, kind: 'gateway', severity: 'offline', message: `Gateway ${gatewayKey} went offline.` })
  }
}

async function resolveOffline(gatewayKey) {
  const { rowCount } = await pool.query(
    `UPDATE alert SET state = 'resolved', resolved_at = now()
     WHERE kind = 'gateway_offline' AND state <> 'resolved' AND device_id IN (${GATEWAY_DEVICES})`,
    [gatewayKey],
  )
  if (rowCount) await addEvent({ gatewayKey, kind: 'gateway', message: `Gateway ${gatewayKey} is back online.` })
}

export async function gatewayStatusChanged(gatewayKey, status) {
  if (status === 'online') return resolveOffline(gatewayKey)
  setTimeout(() => {
    raiseOffline(gatewayKey).catch((err) => console.error(`Offline check for ${gatewayKey} failed: ${err.message}`))
  }, OFFLINE_GRACE_MS)
}

export async function reconcileOffline() {
  const { rows } = await pool.query(`SELECT gateway_key FROM gateway WHERE status = 'offline'`)
  for (const g of rows) await raiseOffline(g.gateway_key)
}

export async function listAlerts({ deviceId = null, systemId = null }) {
  const { rows } = await pool.query(
    `SELECT a.*, d.name AS device_name, d.system_id,
       coalesce(a.state <> 'resolved' AND a.silenced_until > now(), false) AS silenced
     FROM alert a JOIN device d ON d.id = a.device_id
     WHERE ($1::int IS NULL OR a.device_id = $1) AND ($2::int IS NULL OR d.system_id = $2)
     ORDER BY (a.state = 'resolved'), a.raised_at DESC
     LIMIT 500`,
    [deviceId, systemId],
  )
  return rows
}

async function change(id, sql, params, describe) {
  const { rows: [alert] } = await pool.query(`${sql} RETURNING *`, [id, ...params])
  if (!alert) {
    const { rowCount } = await pool.query('SELECT 1 FROM alert WHERE id = $1', [id])
    if (!rowCount) return null
    throw new HttpError(409, 'This alert is already resolved or acknowledged')
  }
  await addEvent({ deviceId: alert.device_id, kind: 'alert', message: describe(alert), actor: params[0] })
  return alert
}

export const acknowledgeAlert = (id, by) => change(
  id,
  `UPDATE alert SET state = 'acknowledged', acknowledged_at = now(), acknowledged_by = $2
   WHERE id = $1 AND state = 'active'`,
  [by],
  (a) => `Alert acknowledged by ${by}: ${a.title}.`,
)

export const silenceAlert = (id, by, minutes = DEFAULT_SILENCE_MINUTES) => change(
  id,
  `UPDATE alert SET silenced_until = now() + make_interval(mins => $3), silenced_by = $2
   WHERE id = $1 AND state <> 'resolved'`,
  [by, minutes],
  (a) => `Alert silenced for ${minutes} minutes by ${by}: ${a.title}.`,
)

export const clearAlert = (id, by) => change(
  id,
  `UPDATE alert SET state = 'resolved', resolved_at = now(), resolved_by = $2
   WHERE id = $1 AND state <> 'resolved'`,
  [by],
  (a) => `Alert cleared by ${by}: ${a.title}.`,
)

export async function listEvents({ deviceId = null, systemId = null }) {
  const { rows } = await pool.query(
    `WITH scope AS (
       SELECT d.id, g.gateway_key FROM device d JOIN gateway g ON g.id = d.gateway_id
       WHERE ($1::int IS NULL OR d.id = $1) AND ($2::int IS NULL OR d.system_id = $2)
     )
     SELECT e.*, d.name AS device_name
     FROM event e LEFT JOIN device d ON d.id = e.device_id
     WHERE e.device_id IN (SELECT id FROM scope)
        OR (e.device_id IS NULL AND e.gateway_key IN (SELECT gateway_key FROM scope))
     ORDER BY e.occurred_at DESC
     LIMIT 500`,
    [deviceId, systemId],
  )
  return rows
}
