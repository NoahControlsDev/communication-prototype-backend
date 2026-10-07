import pool, { withTransaction } from '../db/index.js'
import { insertRow } from '../db/helpers.js'
import { HttpError } from '../utils/HttpError.js'
import { generateProperties, addUnknownExtensions } from './deviceService.js'

// ---------------------------------------------------------------------------
// Gateway birth message (§1.6, §5.6). Every gateway publishes this RETAINED on
// connect, before any data, declaring each device's complete property set:
//
//   topic  bas/<GATEWAY_ID>/birth
//   {
//     "gateway": "GW-01",                               // optional, defaults to the topic
//     "timestamp": "2026-09-30T18:00:00Z",
//     "devices": [
//       {
//         "device_key": "Prudential301.DHW.Boiler1",    // stable key from the gateway (§1.2)
//         "name": "DHW Boiler1", "site_tag": "B01",     // optional
//         "type": "dhw-boiler@1.0",                     // device type = profile key@major.minor
//                                                       // (a known type is accepted instantly)
//         "properties": [
//           { "key": "LeavingWaterTemp", "type": "float", "unit": "°C",
//             "acquisition": "cov", "deadband": 0.2, "min": 0, "max": 120, "writable": false }
//         ]
//       }
//     ]
//   }
//
// Each device becomes one certificate for review. Connection state travels
// separately on bas/<GATEWAY_ID>/status (online = birth, offline = Last Will).
// For manual submission a single device object (with "gateway") is accepted too.
// ---------------------------------------------------------------------------

const PROPERTY_META = ['kind', 'type', 'unit', 'acquisition', 'deadband', 'min', 'max', 'writable']
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export const BIRTH_TOPIC = /^bas\/([^/]+)\/birth$/

function normalizeProperty(p, deviceKey) {
  if (typeof p === 'string') p = { key: p }
  const key = isObject(p) ? str(p.key ?? p.name) : null
  if (!key) throw new HttpError(400, `Device ${deviceKey ?? '?'}: every property needs a key`)
  const src = { ...p, type: p.type ?? p.datatype } // "datatype" accepted as an alias
  const out = { key }
  for (const m of PROPERTY_META) if (src[m] !== undefined && src[m] !== null) out[m] = src[m]
  if (typeof out.acquisition === 'string') out.acquisition = out.acquisition.toLowerCase()
  return out
}

function normalizeDevice(d, { gatewayKey, topic, timestamp, requireKey }) {
  if (!isObject(d)) throw new HttpError(400, 'Each device must be a JSON object')
  const deviceKey = str(d.device_key ?? d.deviceKey)
  if (requireKey && !deviceKey) throw new HttpError(400, 'Every device in a gateway birth message needs a device_key')

  const list = d.properties ?? d.fields
  if (!Array.isArray(list) || !list.length) {
    throw new HttpError(400, `Device ${deviceKey ?? '?'} needs a non-empty "properties" list`)
  }
  const props = new Map()
  for (const p of list) {
    const n = normalizeProperty(p, deviceKey)
    props.set(n.key, n) // duplicates: last one wins
  }

  return {
    topic,
    device_key: deviceKey,
    gateway_key: str(d.gateway ?? d.gateway_key) ?? gatewayKey,
    declared_profile: str(d.type ?? d.profile), // "type" preferred; "profile" still accepted
    name: str(d.name),
    site_tag: str(d.site_tag),
    fields: [...props.values()],
    payload: { gateway: gatewayKey, timestamp, device: d },
  }
}

// Gateway birth message (or a single device object) → one certificate per device.
export function normalize(topic, payload) {
  if (!isObject(payload)) throw new HttpError(400, 'Birth message must be a JSON object')
  const gatewayKey = str(payload.gateway ?? payload.gateway_key ?? payload.GATEWAY_ID)
    ?? str(topic?.match(BIRTH_TOPIC)?.[1])
  const isGatewayMessage = Array.isArray(payload.devices)
  const devices = isGatewayMessage ? payload.devices : [payload]
  if (!devices.length) throw new HttpError(400, 'Birth message lists no devices')

  const ctx = { gatewayKey, topic: topic ?? null, timestamp: str(payload.timestamp), requireKey: isGatewayMessage }
  return devices.map((d) => normalizeDevice(d, ctx))
}

// Stores one certificate per device and returns [{ id, device_key, result, review_reason? }]:
//   auto_accepted → its declared type is a pre-approved profile it satisfies: the device
//                   instance was created on the spot, no review needed
//   new           → a fresh pending certificate (review_reason says why it wasn't automatic)
//   updated       → refreshed the device's existing pending certificate
//   unchanged     → identical to the device's last decided certificate, so nothing to do.
//                   Matters because retained births are re-delivered every time we reconnect.
export async function ingest(topic, payload) {
  const results = []
  for (const c of normalize(topic, payload)) {
    const fields = JSON.stringify(c.fields)

    if (c.device_key) {
      const { rows: [last] } = await pool.query(
        `SELECT id, status, fields = $3::jsonb AS same FROM birth_certificate
         WHERE device_key = $1 AND gateway_key IS NOT DISTINCT FROM $2
         ORDER BY received_at DESC LIMIT 1`,
        [c.device_key, c.gateway_key, fields],
      )
      if (last && last.status !== 'pending' && last.same) {
        results.push({ id: last.id, device_key: c.device_key, result: 'unchanged' })
        continue
      }
    }

    // A pending certificate for the same device is refreshed (unique index
    // birth_certificate_one_pending_idx) instead of piling up duplicates.
    const { rows: [row] } = await pool.query(
      `INSERT INTO birth_certificate
         (topic, device_key, gateway_key, declared_profile, name, site_tag, fields, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (device_key, gateway_key) WHERE status = 'pending' AND device_key IS NOT NULL
       DO UPDATE SET received_at = now(), topic = EXCLUDED.topic,
         declared_profile = EXCLUDED.declared_profile, name = EXCLUDED.name,
         site_tag = EXCLUDED.site_tag, fields = EXCLUDED.fields, payload = EXCLUDED.payload
       RETURNING id, device_key, (xmax = 0) AS inserted`,
      [c.topic, c.device_key, c.gateway_key, c.declared_profile, c.name, c.site_tag,
        fields, JSON.stringify(c.payload)],
    )
    const auto = await tryAutoAccept(row.id)
    results.push({
      id: row.id,
      device_key: row.device_key,
      result: auto.accepted ? 'auto_accepted' : row.inserted ? 'new' : 'updated',
      ...(auto.reason && { review_reason: auto.reason }),
    })
  }
  return results
}

// --- auto-accept ---------------------------------------------------------------------------

const TYPE_REF = /^(.+)@(\d+)\.(\d+)$/

// "dhw-boiler@1.0" → that exact version; "dhw-boiler" → its latest version.
async function resolveType(db, ref) {
  const m = ref.match(TYPE_REF)
  const { rows } = m
    ? await db.query('SELECT * FROM profile WHERE key = $1 AND major = $2 AND minor = $3', [m[1], m[2], m[3]])
    : await db.query('SELECT * FROM profile WHERE key = $1 ORDER BY major DESC, minor DESC LIMIT 1', [ref])
  return rows[0] ?? null
}

const differs = (a, b) => a != null && b != null && String(a).toLowerCase() !== String(b).toLowerCase()

// → { profileId } when the certificate can be accepted without review, otherwise { reason }.
// A declared type is trusted when it names a profile that allows auto-accept, the device
// reports every required property (the contract, §2.1), nothing contradicts the profile's
// unit or type, and nobody declined this device or registered it as something else.
async function autoAcceptCheck(db, cert) {
  if (!cert.declared_profile) return { reason: 'No device type declared' }
  if (!cert.device_key) return { reason: 'No device key' }
  if (!cert.gateway_key) return { reason: 'No gateway' }

  const profile = await resolveType(db, cert.declared_profile)
  if (!profile) return { reason: `Device type "${cert.declared_profile}" doesn't match any profile` }
  const typeName = `${profile.key}@${profile.major}.${profile.minor}`
  if (!profile.auto_accept) return { reason: `Profile ${typeName} is set to manual review` }

  const { rows: [lastDecision] } = await db.query(
    `SELECT status FROM birth_certificate
     WHERE device_key = $1 AND gateway_key = $2 AND id <> $3 AND status <> 'pending'
     ORDER BY decided_at DESC LIMIT 1`,
    [cert.device_key, cert.gateway_key, cert.id],
  )
  if (lastDecision?.status === 'declined') return { reason: 'This device was declined before' }
  const { rowCount: declinedRule } = await db.query(
    'SELECT 1 FROM declined_point WHERE gateway_key = $1 AND device_key = $2 AND key IS NULL',
    [cert.gateway_key, cert.device_key],
  )
  if (declinedRule) return { reason: 'This device is declined on the Data page' }

  const { rows: [existing] } = await db.query(
    `SELECT d.profile_id, g.gateway_key, p.key, p.major, p.minor
     FROM device d JOIN gateway g ON g.id = d.gateway_id JOIN profile p ON p.id = d.profile_id
     WHERE d.device_key = $1`,
    [cert.device_key],
  )
  if (existing && existing.gateway_key !== cert.gateway_key) {
    return { reason: `Device is registered under gateway ${existing.gateway_key}` }
  }
  if (existing && existing.profile_id !== profile.id) {
    return { reason: `Device is already registered as ${existing.key}@${existing.major}.${existing.minor}` }
  }

  const { rows: declared } = await db.query(
    'SELECT key, type, unit, required FROM profile_property WHERE profile_id = $1', [profile.id])
  const sent = new Map(cert.fields.map((f) => [f.key, f]))
  const missing = declared.filter((p) => p.required && !sent.has(p.key)).map((p) => p.key)
  if (missing.length) {
    return { reason: `Missing required properties of ${typeName}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}` }
  }
  const conflicts = declared.flatMap((p) => {
    const f = sent.get(p.key)
    if (!f) return []
    if (differs(f.unit, p.unit)) return [`${p.key} unit ${f.unit} (profile: ${p.unit})`]
    if (differs(f.type, p.type)) return [`${p.key} type ${f.type} (profile: ${p.type})`]
    return []
  })
  if (conflicts.length) return { reason: `Differs from ${typeName}: ${conflicts.slice(0, 3).join('; ')}` }

  return { profileId: profile.id }
}

// Accepts a pending certificate on the spot if its type allows; otherwise records why not.
async function tryAutoAccept(id) {
  try {
    return await withTransaction(async (client) => {
      const cert = await lockPending(client, id)
      const check = await autoAcceptCheck(client, cert)
      if (check.reason) {
        await client.query('UPDATE birth_certificate SET review_reason = $2 WHERE id = $1', [id, check.reason])
        return { accepted: false, reason: check.reason }
      }
      await acceptOne(client, id, { profile: { mode: 'existing', profile_id: check.profileId } })
      await client.query('UPDATE birth_certificate SET auto_accepted = true, review_reason = NULL WHERE id = $1', [id])
      return { accepted: true }
    })
  } catch (err) {
    if (err.status === 409) return { accepted: false } // another backend instance decided it first
    throw err
  }
}

export async function listCertificates(status) {
  const { rows } = await pool.query(
    `SELECT c.id, c.received_at, c.topic, c.device_key, c.gateway_key, c.declared_profile, c.name,
       jsonb_array_length(c.fields) AS field_count, c.status, c.decided_at, c.device_id,
       c.auto_accepted, c.review_reason,
       -- sorted field keys: lets the admin group devices reporting identical property sets
       (SELECT array_agg(f->>'key' ORDER BY f->>'key') FROM jsonb_array_elements(c.fields) f) AS field_keys,
       EXISTS (SELECT 1 FROM device d WHERE d.device_key = c.device_key) AS device_exists
     FROM birth_certificate c
     WHERE $1::certificate_status IS NULL OR c.status = $1
     ORDER BY c.received_at DESC
     LIMIT 5000`,
    [status ?? null],
  )
  return rows
}

// The certificate plus everything needed to decide on it: an existing device with
// the same key, whether the gateway exists, and how well each profile fits its fields.
export async function getCertificate(id) {
  const { rows } = await pool.query('SELECT * FROM birth_certificate WHERE id = $1', [id])
  const cert = rows[0]
  if (!cert) return null

  const fieldKeys = new Set(cert.fields.map((f) => f.key))

  const [device, gateway, profiles] = await Promise.all([
    cert.device_key
      ? pool.query(
          `SELECT d.id, d.name, d.status, p.key AS profile_key, p.major AS profile_major, p.minor AS profile_minor,
             array(SELECT key FROM device_property WHERE device_id = d.id) AS property_keys
           FROM device d JOIN profile p ON p.id = d.profile_id WHERE d.device_key = $1`,
          [cert.device_key],
        )
      : { rows: [] },
    cert.gateway_key
      ? pool.query('SELECT id, gateway_key FROM gateway WHERE gateway_key = $1', [cert.gateway_key])
      : { rows: [] },
    pool.query(
      `SELECT p.id, p.key, p.major, p.minor,
         coalesce(array_agg(pp.key) FILTER (WHERE pp.key IS NOT NULL), '{}') AS keys
       FROM profile p LEFT JOIN profile_property pp ON pp.profile_id = p.id
       GROUP BY p.id`,
    ),
  ])

  const candidates = profiles.rows
    .map((p) => {
      const keys = new Set(p.keys)
      const missing = p.keys.filter((k) => !fieldKeys.has(k))
      const extra = [...fieldKeys].filter((k) => !keys.has(k))
      const matched = fieldKeys.size - extra.length
      return {
        id: p.id, key: p.key, major: p.major, minor: p.minor,
        declared: cert.declared_profile === `${p.key}@${p.major}.${p.minor}`,
        exact: missing.length === 0 && extra.length === 0,
        matched, missing, extra,
      }
    })
    .filter((c) => c.declared || c.matched > 0)
    .sort((a, b) => b.declared - a.declared || b.exact - a.exact || b.matched - a.matched || a.missing.length - b.missing.length)
    .slice(0, 8)

  let existingDevice = device.rows[0] ?? null
  if (existingDevice) {
    const have = new Set(existingDevice.property_keys)
    existingDevice = { ...existingDevice, unknown_fields: [...fieldKeys].filter((k) => !have.has(k)) }
    delete existingDevice.property_keys
  }

  return { ...cert, existing_device: existingDevice, gateway: gateway.rows[0] ?? null, candidates }
}

async function lockPending(client, id) {
  const { rows } = await client.query('SELECT * FROM birth_certificate WHERE id = $1 FOR UPDATE', [id])
  if (!rows[0]) throw new HttpError(404, 'Birth certificate not found')
  if (rows[0].status !== 'pending') throw new HttpError(409, `Certificate was already ${rows[0].status}`)
  return rows[0]
}

async function findOrCreateGateway(client, gatewayKey) {
  const { rows } = await client.query('SELECT id FROM gateway WHERE gateway_key = $1', [gatewayKey])
  return rows[0]?.id ?? (await insertRow(client, 'gateway', { gateway_key: gatewayKey })).id
}

// A new profile chosen while accepting: created once, then used like an existing one.
async function resolveProfile(client, profile) {
  if (profile.mode === 'new') {
    const { properties, ...data } = profile.data
    const id = (await insertRow(client, 'profile', data)).id
    for (const p of properties) await insertRow(client, 'profile_property', { profile_id: id, ...p })
    return { mode: 'existing', profile_id: id }
  }
  return profile
}

// Accepts one certificate inside the caller's transaction:
//  • device with this key already exists → its unknown fields become extensions awaiting review
//  • otherwise → create the device (pending) on the chosen profile; certificate fields the
//    profile doesn't declare become extensions awaiting review (§2.1)
async function acceptOne(client, id, decision) {
  const cert = await lockPending(client, id)
  const fieldKeys = cert.fields.map((f) => f.key)
  const deviceKey = decision.device_key ?? cert.device_key
  if (!deviceKey) throw new HttpError(400, 'device_key is required')

  const { rows: existing } = await client.query(
    'SELECT id, profile_id FROM device WHERE device_key = $1', [deviceKey])

  let deviceId, profileId, added
  if (existing[0]) {
    deviceId = existing[0].id
    profileId = existing[0].profile_id
    added = await addUnknownExtensions(client, deviceId, fieldKeys)
  } else {
    const gatewayKey = decision.gateway_key ?? cert.gateway_key
    if (!gatewayKey) throw new HttpError(400, 'gateway_key is required')
    if (decision.profile.mode !== 'existing') {
      throw new HttpError(400, 'Choose an existing profile or create a new one')
    }
    profileId = decision.profile.profile_id

    const device = await insertRow(client, 'device', {
      device_key: deviceKey,
      name: decision.name ?? cert.name ?? deviceKey,
      site_tag: decision.site_tag ?? cert.site_tag,
      gateway_id: await findOrCreateGateway(client, gatewayKey),
      profile_id: profileId,
      status: 'pending',
      system_id: null,
    })
    deviceId = device.id
    await generateProperties(client, deviceId)
    added = await addUnknownExtensions(client, deviceId, fieldKeys)
  }

  await client.query(
    `UPDATE birth_certificate
     SET status = 'accepted', decided_at = now(), device_id = $2, profile_id = $3, device_key = $4
     WHERE id = $1`,
    [id, deviceId, profileId, deviceKey],
  )
  return { id, device_id: deviceId, extensions_added: added, updated_existing: Boolean(existing[0]) }
}

export async function accept(id, decision) {
  return withTransaction(async (client) => {
    const profile = await resolveProfile(client, decision.profile)
    return acceptOne(client, id, { ...decision, profile })
  })
}

// Accepts many certificates onto one profile (e.g. every device with the same field set),
// all or nothing. Device details come from each certificate. A new profile is created once.
export async function acceptMany(ids, profileDecision) {
  return withTransaction(async (client) => {
    const profile = await resolveProfile(client, profileDecision)
    const results = []
    for (const id of ids) {
      try {
        results.push(await acceptOne(client, id, { profile }))
      } catch (err) {
        const { rows } = await client.query('SELECT device_key FROM birth_certificate WHERE id = $1', [id])
        err.message = `Certificate ${rows[0]?.device_key ?? `#${id}`}: ${err.message}`
        throw err // rolls back the whole batch
      }
    }
    return results
  })
}

// Data from a device that is declined is not saved at all, so declining its certificate also
// deletes what is already held for it (unless the device exists on that gateway after all).
async function dropHeldFor(db, certIds) {
  await db.query(
    `DELETE FROM unapproved_reading u
     USING birth_certificate c
     WHERE c.id = ANY($1::int[]) AND c.status = 'declined'
       AND u.device_key = c.device_key AND u.gateway_key = c.gateway_key
       AND u.reason IN ('unknown_device', 'gateway_mismatch')`,
    [certIds],
  )
}

// Declines every pending certificate at once. Returns how many were declined.
export async function declineAll() {
  const { rows } = await pool.query(
    `UPDATE birth_certificate SET status = 'declined', decided_at = now() WHERE status = 'pending' RETURNING id`,
  )
  await dropHeldFor(pool, rows.map((r) => r.id))
  return rows.length
}

// Declines the given certificates; ones already decided are skipped. Returns how many were declined.
export async function declineMany(ids) {
  const { rowCount } = await pool.query(
    `UPDATE birth_certificate SET status = 'declined', decided_at = now()
     WHERE id = ANY($1::int[]) AND status = 'pending'`,
    [ids],
  )
  await dropHeldFor(pool, ids)
  return rowCount
}

// Puts declined certificates back to pending so they can be reviewed again.
// Fails (all or nothing) if the same device already has a newer pending certificate,
// since a device can only have one pending at a time.
export async function reopenMany(ids) {
  return withTransaction(async (client) => {
    let reopened = 0
    for (const id of ids) {
      try {
        await client.query('SAVEPOINT reopen')
        const { rowCount } = await client.query(
          `UPDATE birth_certificate SET status = 'pending', decided_at = NULL
           WHERE id = $1 AND status = 'declined'`,
          [id],
        )
        reopened += rowCount
      } catch (err) {
        if (err.code !== '23505') throw err
        await client.query('ROLLBACK TO SAVEPOINT reopen')
        const { rows } = await client.query('SELECT device_key FROM birth_certificate WHERE id = $1', [id])
        throw new HttpError(409, `${rows[0]?.device_key ?? `Certificate #${id}`} already has a newer pending certificate; review that one instead`)
      }
    }
    return reopened
  })
}

// Removes certificate records entirely (any status). Devices created by accepting
// them stay. If the gateway sends the device again, e.g. its retained birth on the
// next reconnect, it arrives as a brand-new pending certificate.
export async function deleteMany(ids) {
  const { rowCount } = await pool.query('DELETE FROM birth_certificate WHERE id = ANY($1::int[])', [ids])
  return rowCount
}

export async function decline(id) {
  return withTransaction(async (client) => {
    await lockPending(client, id)
    const { rows } = await client.query(
      `UPDATE birth_certificate SET status = 'declined', decided_at = now() WHERE id = $1 RETURNING *`,
      [id],
    )
    await dropHeldFor(client, [id])
    return rows[0]
  })
}
