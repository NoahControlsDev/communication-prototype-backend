import pool from '../db/index.js'
import { insertRow, updateRow, deleteRow } from '../db/helpers.js'

export async function listEnums() {
  const { rows } = await pool.query(`
    SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    GROUP BY t.typname`)
  return Object.fromEntries(rows.map((r) => [r.name, r.values]))
}

export async function listProfiles() {
  const { rows } = await pool.query(`
    SELECT p.*,
      (SELECT count(*)::int FROM profile_property pp WHERE pp.profile_id = p.id) AS property_count,
      (SELECT count(*)::int FROM device d WHERE d.profile_id = p.id) AS device_count
    FROM profile p
    ORDER BY p.key, p.major, p.minor`)
  return rows
}

export async function profileExists(id) {
  const { rowCount } = await pool.query('SELECT 1 FROM profile WHERE id = $1', [id])
  return rowCount > 0
}

export const createProfile = (data) => insertRow(pool, 'profile', data)
export const updateProfile = (id, data) => updateRow(pool, 'profile', id, data)
export const deleteProfile = (id) => deleteRow(pool, 'profile', id)

export async function listProperties(profileId) {
  const { rows } = await pool.query(
    'SELECT * FROM profile_property WHERE profile_id = $1 ORDER BY id',
    [profileId],
  )
  return rows
}

export const createProperty = (profileId, data) =>
  insertRow(pool, 'profile_property', { profile_id: profileId, ...data })
export const updateProperty = (id, data) => updateRow(pool, 'profile_property', id, data)
export const deleteProperty = (id) => deleteRow(pool, 'profile_property', id)
