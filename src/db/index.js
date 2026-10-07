import pg from 'pg'
import config from '../config/index.js'

const pool = new pg.Pool(config.db)

// Runs fn(client) inside BEGIN/COMMIT; any thrown error rolls everything back.
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export default pool
