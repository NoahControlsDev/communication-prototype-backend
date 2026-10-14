import pool, { withTransaction } from '../db/index.js'
import { insertRow, updateRow, deleteRow } from '../db/helpers.js'

const DEVICE_SELECT = `
  SELECT d.*,
    p.key AS profile_key, p.major AS profile_major, p.minor AS profile_minor,
    g.gateway_key,
    s.name AS system_name,
    (SELECT count(*)::int FROM device_property dp
      WHERE dp.device_id = d.id AND NOT dp.approved) AS awaiting_review
  FROM device d
  JOIN profile p ON p.id = d.profile_id
  JOIN gateway g ON g.id = d.gateway_id
  LEFT JOIN system s ON s.id = d.system_id`

export async function generateProperties(db, deviceId) {
  const { rowCount } = await db.query(
    `INSERT INTO device_property (device_id, profile_property_id, key, is_standard, approved)
     SELECT d.id, pp.id, pp.key, true, true
     FROM device d JOIN profile_property pp ON pp.profile_id = d.profile_id
     WHERE d.id = $1
     ON CONFLICT (device_id, key) DO NOTHING`,
    [deviceId],
  )
  return rowCount
}

export async function listDevices() {
  const { rows } = await pool.query(`${DEVICE_SELECT} ORDER BY d.name`)
  return rows
}

export async function getDevice(id) {
  const { rows } = await pool.query(`${DEVICE_SELECT} WHERE d.id = $1`, [id])
  if (!rows[0]) return null

  const { rows: properties } = await pool.query(
    `SELECT dp.*,
       pp.kind, pp.type, pp.unit, pp.enum_map,
       pp.min AS declared_min, pp.max AS declared_max, pp.writable AS declared_writable,
       lr.time AS last_time, lr.value AS last_value, lr.quality AS last_quality,
       (SELECT count(*)::int FROM unapproved_reading u WHERE u.device_property_id = dp.id) AS held_count
     FROM device_property dp
     LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
     LEFT JOIN LATERAL (
       SELECT time, value, quality FROM reading r
       WHERE r.device_property_id = dp.id ORDER BY time DESC LIMIT 1
     ) lr ON true
     WHERE dp.device_id = $1
     ORDER BY dp.is_standard DESC, dp.key`,
    [id],
  )
  return { ...rows[0], properties }
}

export async function createDevice(data) {
  const id = await withTransaction(async (client) => {
    const device = await insertRow(client, 'device', { ...data, status: 'pending', system_id: null })
    await generateProperties(client, device.id)
    return device.id
  })
  return getDevice(id)
}

export async function updateDevice(id, data) {
  const updated = await updateRow(pool, 'device', id, data)
  return updated && getDevice(id)
}

export const deleteDevice = (id) => deleteRow(pool, 'device', id)

export async function syncProperties(id) {
  return generateProperties(pool, id)
}

export const addExtension = (deviceId, data) =>
  insertRow(pool, 'device_property', {
    device_id: deviceId,
    profile_property_id: null,
    is_standard: false,
    approved: false,
    ...data,
  })

export async function addUnknownExtensions(db, deviceId, keys) {
  if (!keys.length) return 0
  const { rowCount } = await db.query(
    `INSERT INTO device_property (device_id, profile_property_id, key, is_standard, approved)
     SELECT $1, NULL, k, false, false FROM unnest($2::varchar[]) AS k
     ON CONFLICT (device_id, key) DO NOTHING`,
    [deviceId, keys],
  )
  return rowCount
}

export const updateDeviceProperty = (id, data) => updateRow(pool, 'device_property', id, data)

export async function deleteDeviceProperty(id) {
  const { rows } = await pool.query('SELECT is_standard FROM device_property WHERE id = $1', [id])
  if (!rows[0]) return 'missing'
  if (rows[0].is_standard) return 'standard'
  await deleteRow(pool, 'device_property', id)
  return 'deleted'
}
