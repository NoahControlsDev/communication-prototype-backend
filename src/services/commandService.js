import pool from '../db/index.js'
import { HttpError } from '../utils/HttpError.js'
import { addEvent } from './alertService.js'

const ACK_TIMEOUT_MS = 20_000

export const COMMAND_ACK_TOPIC = /^bas\/([^/]+)\/cmd\/ack$/
export const COMMAND_TOPIC = /^bas\/([^/]+)\/cmd$/

const describe = (c) => `${c.key} = ${c.value}`

export async function createCommand(propertyId, rawValue, by) {
  const { rows: [p] } = await pool.query(
    `SELECT dp.id, dp.key, dp.approved, dp.writable_override, pp.writable, pp.type,
       coalesce(dp.min_override, pp.min) AS lo, coalesce(dp.max_override, pp.max) AS hi,
       d.id AS device_id, d.name AS device_name, d.device_key, g.gateway_key, g.status AS gateway_status
     FROM device_property dp
     JOIN device d ON d.id = dp.device_id
     JOIN gateway g ON g.id = d.gateway_id
     LEFT JOIN profile_property pp ON pp.id = dp.profile_property_id
     WHERE dp.id = $1`,
    [propertyId],
  )
  if (!p) return null

  const value = typeof rawValue === 'boolean' ? Number(rawValue) : Number(rawValue)
  if (rawValue === null || rawValue === '' || !Number.isFinite(value)) throw new HttpError(400, 'value must be a number')
  if (!p.writable || p.writable_override === false) throw new HttpError(400, `${p.key} is read-only`)
  if (!p.approved) throw new HttpError(400, `${p.key} is not approved yet`)
  if (p.type === 'int' && !Number.isInteger(value)) throw new HttpError(400, `${p.key} takes whole numbers`)
  if (p.type === 'bool' && value !== 0 && value !== 1) throw new HttpError(400, `${p.key} takes 0 or 1`)
  if ((p.lo !== null && value < p.lo) || (p.hi !== null && value > p.hi)) {
    throw new HttpError(400, `${p.key} must be between ${p.lo ?? '−∞'} and ${p.hi ?? '∞'}`)
  }
  if (p.gateway_status !== 'online') {
    throw new HttpError(409, `Gateway ${p.gateway_key} is not online, so the command can't be delivered`)
  }

  const { rows: [command] } = await pool.query(
    `INSERT INTO command (device_id, device_property_id, key, value, requested_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [p.device_id, p.id, p.key, value, by],
  )
  return {
    command,
    topic: `bas/${p.gateway_key}/cmd`,
    payload: {
      id: Number(command.id),
      timestamp: command.requested_at,
      by,
      device_key: p.device_key,
      key: p.key,
      value,
    },
  }
}

async function finish(id, status, reason = null) {
  const { rows: [command] } = await pool.query(
    `UPDATE command SET status = $2, result_at = now(), reason = $3
     WHERE id = $1 AND status = 'sent' RETURNING *`,
    [id, status, reason],
  )
  return command ?? null
}

export async function commandSent(command) {
  await addEvent({
    deviceId: command.device_id,
    kind: 'command',
    message: `Command sent by ${command.requested_by}: ${describe(command)}.`,
    actor: command.requested_by,
  })
  setTimeout(async () => {
    try {
      const expired = await finish(command.id, 'timeout', 'The gateway did not answer')
      if (expired) {
        await addEvent({
          deviceId: expired.device_id, kind: 'command', severity: 'warning',
          message: `No answer from the gateway to command ${describe(expired)}.`,
        })
      }
    } catch (err) {
      console.error(`Command ${command.id} timeout check failed: ${err.message}`)
    }
  }, ACK_TIMEOUT_MS)
}

export async function commandFailed(command, reason) {
  const failed = await finish(command.id, 'failed', reason)
  if (failed) {
    await addEvent({
      deviceId: failed.device_id, kind: 'command', severity: 'warning',
      message: `Command ${describe(failed)} could not be sent: ${reason}.`,
    })
  }
}

export async function recordAck(gatewayKey, ack) {
  const id = Number(ack?.id)
  if (!Number.isInteger(id)) throw new Error('Command acknowledgement has no id')
  const applied = ack.status === 'applied'
  const reason = applied ? null : String(ack.reason ?? 'Rejected by the gateway')
  const command = await finish(id, applied ? 'applied' : 'rejected', reason)
  if (!command) return null
  await addEvent({
    deviceId: command.device_id,
    kind: 'command',
    severity: applied ? 'info' : 'warning',
    message: applied
      ? `Command applied by gateway ${gatewayKey}: ${describe(command)}.`
      : `Command ${describe(command)} rejected by gateway ${gatewayKey}: ${reason}.`,
  })
  return command
}

export async function listCommands(deviceId) {
  const { rows } = await pool.query(
    `SELECT * FROM command WHERE device_id = $1 ORDER BY requested_at DESC LIMIT 50`,
    [deviceId],
  )
  return rows
}
