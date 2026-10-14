import pool from '../db/index.js'
import { insertRow, deleteRow } from '../db/helpers.js'

export async function listConnections() {
  const { rows } = await pool.query('SELECT * FROM device_connection ORDER BY id')
  return rows
}

export const createConnection = (data) => insertRow(pool, 'device_connection', data)
export const deleteConnection = (id) => deleteRow(pool, 'device_connection', id)
