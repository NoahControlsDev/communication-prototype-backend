import pool from '../db/index.js'
import { insertRow, updateRow, deleteRow } from '../db/helpers.js'

export async function listSystems() {
  const { rows } = await pool.query(`
    SELECT s.*, (SELECT count(*)::int FROM device d WHERE d.system_id = s.id) AS device_count
    FROM system s ORDER BY s.name`)
  return rows
}

export const createSystem = (data) => insertRow(pool, 'system', data)
export const updateSystem = (id, data) => updateRow(pool, 'system', id, data)
export const deleteSystem = (id) => deleteRow(pool, 'system', id)

export async function listGateways() {
  const { rows } = await pool.query(`
    SELECT g.*, (SELECT count(*)::int FROM device d WHERE d.gateway_id = g.id) AS device_count
    FROM gateway g ORDER BY g.gateway_key`)
  return rows
}

export async function getGatewayStatus(gatewayKey) {
  const { rows } = await pool.query('SELECT status FROM gateway WHERE gateway_key = $1', [gatewayKey])
  return rows[0]?.status ?? null
}

export async function setGatewayStatus(gatewayKey, status) {
  await pool.query(
    `INSERT INTO gateway (gateway_key, status, status_at) VALUES ($1, $2, now())
     ON CONFLICT (gateway_key) DO UPDATE SET
       status = EXCLUDED.status,
       status_at = CASE WHEN gateway.status IS DISTINCT FROM EXCLUDED.status
                        THEN now() ELSE gateway.status_at END`,
    [gatewayKey, status],
  )
}

export const createGateway = (data) => insertRow(pool, 'gateway', data)
export const updateGateway = (id, data) => updateRow(pool, 'gateway', id, data)
export const deleteGateway = (id) => deleteRow(pool, 'gateway', id)
