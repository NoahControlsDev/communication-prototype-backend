import * as alertService from '../services/alertService.js'
import { found } from '../utils/HttpError.js'
import { parse, parseId, integer, text } from '../utils/validate.js'

const ACTOR = 'Administrator'
const SILENCE = { minutes: integer(), by: text() }
const ACTION = { by: text() }

const scope = (query) => ({
  deviceId: query.device_id ? parseId(query.device_id) : null,
  systemId: query.system_id ? parseId(query.system_id) : null,
})

export async function getAlerts(req, res) {
  res.json(await alertService.listAlerts(scope(req.query)))
}

export async function postAcknowledge(req, res) {
  const { by } = parse(req.body, ACTION)
  res.json(found(await alertService.acknowledgeAlert(parseId(req.params.id), by ?? ACTOR), 'Alert'))
}

export async function postSilence(req, res) {
  const { by, minutes } = parse(req.body, SILENCE)
  res.json(found(await alertService.silenceAlert(parseId(req.params.id), by ?? ACTOR, minutes ?? undefined), 'Alert'))
}

export async function postClear(req, res) {
  const { by } = parse(req.body, ACTION)
  res.json(found(await alertService.clearAlert(parseId(req.params.id), by ?? ACTOR), 'Alert'))
}

export async function getEvents(req, res) {
  res.json(await alertService.listEvents(scope(req.query)))
}
