import * as dataService from '../services/dataService.js'
import { HttpError } from '../utils/HttpError.js'
import { parse, parseId, text } from '../utils/validate.js'

const REASONS = ['unknown_device', 'gateway_mismatch', 'unknown_property', 'awaiting_review', 'not_numeric']

export async function getLatest(req, res) {
  res.json(await dataService.latestReadings())
}

export async function getUnapproved(req, res) {
  res.json(await dataService.unapprovedSummary())
}

// Body: any of { gateway_key, device_key, key, reason }; {} clears everything held.
export async function postDeleteUnapproved(req, res) {
  const filters = parse(req.body, { gateway_key: text(), device_key: text(), key: text(), reason: text() })
  if (filters.reason && !REASONS.includes(filters.reason)) {
    throw new HttpError(400, `reason must be one of ${REASONS.join(', ')}`)
  }
  res.json({ deleted: await dataService.deleteUnapproved(filters) })
}

// Body: { gateway_key, device_key, key? }: key omitted declines the whole device.
export async function postDecline(req, res) {
  const rule = parse(req.body, { gateway_key: text({ required: true }), device_key: text({ required: true }), key: text() })
  res.status(201).json(await dataService.declinePoint(rule))
}

export async function getDeclined(req, res) {
  res.json(await dataService.listDeclined())
}

export async function deleteDeclined(req, res) {
  if (!(await dataService.undeclinePoint(parseId(req.params.id)))) throw new HttpError(404, 'Declined rule not found')
  res.status(204).end()
}

export async function postPromote(req, res) {
  res.json({ promoted: await dataService.promoteUnapproved() })
}

// Manual data message, same format as bas/<GATEWAY_ID>/data. Useful for testing.
export async function postData(req, res) {
  const { gateway_key: gatewayKey, payload } = req.body ?? {}
  if (typeof gatewayKey !== 'string' || !gatewayKey.trim()) throw new HttpError(400, 'gateway_key is required')
  res.status(201).json(await dataService.ingestData(gatewayKey.trim(), payload))
}

function parseRange(value) {
  const range = value ?? '1h'
  if (!Object.hasOwn(dataService.RANGES, range)) {
    throw new HttpError(400, `range must be one of ${Object.keys(dataService.RANGES).join(', ')}`)
  }
  return range
}

// ?range=15m|1h|6h|24h|7d
export async function getHistory(req, res) {
  const history = await dataService.propertyHistory(parseId(req.params.id), parseRange(req.query.range))
  if (!history) throw new HttpError(404, 'Device property not found')
  res.json(history)
}

export async function getDeviceSeries(req, res) {
  res.json(await dataService.deviceSeries(parseId(req.params.id), parseRange(req.query.range)))
}

export async function getStats(req, res) {
  res.json(await dataService.ingestionStats(parseRange(req.query.range)))
}
