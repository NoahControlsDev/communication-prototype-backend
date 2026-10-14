import pool from '../db/index.js'
import config from '../config/index.js'

const META = ['kind', 'type', 'unit', 'lo', 'hi', 'acquisition', 'deadband', 'writable']

export async function listFields() {
  const [props, held, certs, rules] = await Promise.all([
    pool.query(
      `SELECT g.gateway_key, d.id AS device_id, d.device_key, d.name AS device_name,
         p.key || '@' || p.major || '.' || p.minor AS device_type,
         dp.id AS device_property_id, dp.key, dp.is_standard, dp.approved,
         pp.kind, pp.type, pp.unit, pp.acquisition, pp.deadband, pp.writable,
         coalesce(dp.min_override, pp.min) AS lo, coalesce(dp.max_override, pp.max) AS hi,
         lr.time AS last_time, lr.value AS last_value, lr.quality AS last_quality
       FROM device_property dp
       JOIN device d ON d.id = dp.device_id
       JOIN gateway g ON g.id = d.gateway_id
       JOIN profile p ON p.id = d.profile_id
       LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
       LEFT JOIN LATERAL (
         SELECT time, value, quality FROM reading r
         WHERE r.device_property_id = dp.id ORDER BY time DESC LIMIT 1
       ) lr ON true`,
    ),
    pool.query(
      `SELECT gateway_key, device_key, key, reason, count(*)::int AS count,
         max(time) AS last_time, (array_agg(value ORDER BY time DESC))[1] AS last_value,
         min(received_at) + make_interval(hours => $1) AS expires_at
       FROM unapproved_reading GROUP BY gateway_key, device_key, key, reason`,
      [config.unapprovedRetentionHours],
    ),
    pool.query(
      `SELECT DISTINCT ON (device_key, gateway_key)
         id, device_key, gateway_key, status, declared_profile, name, fields, review_reason
       FROM birth_certificate
       WHERE device_key IS NOT NULL AND gateway_key IS NOT NULL
       ORDER BY device_key, gateway_key, received_at DESC`,
    ),
    pool.query('SELECT id, gateway_key, device_key, key FROM declined_point'),
  ])

  const fields = new Map()
  const idOf = (gw, dev, key) => `${gw}|${dev}|${key}`
  const get = (gw, dev, key) => {
    const id = idOf(gw, dev, key)
    if (!fields.has(id)) {
      fields.set(id, {
        id, gateway_key: gw, device_key: dev, key,
        device_id: null, device_name: null, device_type: null, device_property_id: null,
        source: null, approved: null, meta: {}, last: null,
        held_count: 0, held_reason: null, expires_at: null,
        certificate: null, declined_rule_id: null,
      })
    }
    return fields.get(id)
  }
  const setMeta = (f, m, override) => {
    for (const k of META) {
      if (m[k] !== undefined && m[k] !== null && (override || f.meta[k] === undefined)) f.meta[k] = m[k]
    }
  }

  for (const c of certs.rows) {
    for (const cf of c.fields) {
      const f = get(c.gateway_key, c.device_key, cf.key)
      f.certificate = { id: c.id, status: c.status, review_reason: c.review_reason, declared_type: c.declared_profile }
      f.device_name ??= c.name
      setMeta(f, { ...cf, lo: cf.min, hi: cf.max }, false)
    }
  }

  for (const p of props.rows) {
    const f = get(p.gateway_key, p.device_key, p.key)
    Object.assign(f, {
      device_id: p.device_id, device_name: p.device_name, device_type: p.device_type,
      device_property_id: p.device_property_id, source: p.is_standard ? 'standard' : 'extension', approved: p.approved,
    })
    if (p.is_standard) setMeta(f, p, true)
    if (p.last_time) f.last = { time: p.last_time, value: p.last_value, quality: p.last_quality }
  }

  for (const h of held.rows) {
    const f = get(h.gateway_key, h.device_key, h.key)
    f.held_count += h.count
    f.held_reason = h.reason
    f.expires_at = f.expires_at && f.expires_at < h.expires_at ? f.expires_at : h.expires_at
    if (!f.last || new Date(h.last_time) > new Date(f.last.time)) {
      f.last = { time: h.last_time, value: h.last_value, quality: null, held: true }
    }
  }

  const deviceRules = new Map(), keyRules = new Map()
  for (const r of rules.rows) {
    if (r.key === null) deviceRules.set(`${r.gateway_key}|${r.device_key}`, r.id)
    else {
      keyRules.set(idOf(r.gateway_key, r.device_key, r.key), r.id)
      get(r.gateway_key, r.device_key, r.key)
    }
  }

  for (const f of fields.values()) {
    const rule = keyRules.get(f.id) ?? deviceRules.get(`${f.gateway_key}|${f.device_key}`)
    if (f.approved) {
      f.state = 'accepted'; f.why = null
    } else if (rule) {
      f.state = 'declined'; f.why = 'declined_rule'; f.declined_rule_id = rule
    } else if (!f.device_id && f.certificate?.status === 'declined') {
      f.state = 'declined'; f.why = 'declined_certificate'
    } else {
      f.state = 'not_approved'
      f.why = f.device_property_id ? 'awaiting_review'
        : f.held_reason ?? (f.device_id ? 'unknown_property' : 'pending_certificate')
    }
  }

  const deviceByKey = new Map(props.rows.map((p) => [`${p.gateway_key}|${p.device_key}`, p]))
  for (const f of fields.values()) {
    const d = deviceByKey.get(`${f.gateway_key}|${f.device_key}`)
    if (d && !f.device_id) Object.assign(f, { device_id: d.device_id, device_name: d.device_name, device_type: d.device_type })
  }

  return [...fields.values()].sort((a, b) =>
    a.gateway_key.localeCompare(b.gateway_key) || a.device_key.localeCompare(b.device_key) || a.key.localeCompare(b.key))
}

export async function approveField({ gateway_key, device_key, key }) {
  const { rows: [device] } = await pool.query(
    `SELECT d.id FROM device d JOIN gateway g ON g.id = d.gateway_id
     WHERE d.device_key = $1 AND g.gateway_key = $2`,
    [device_key, gateway_key],
  )
  if (!device) return null
  const { rows: [property] } = await pool.query(
    `INSERT INTO device_property (device_id, profile_property_id, key, is_standard, approved)
     VALUES ($1, NULL, $2, false, true)
     ON CONFLICT (device_id, key) DO UPDATE SET approved = true
     RETURNING *`,
    [device.id, key],
  )
  await pool.query(
    'DELETE FROM declined_point WHERE gateway_key = $1 AND device_key = $2 AND key = $3',
    [gateway_key, device_key, key],
  )
  return property
}
