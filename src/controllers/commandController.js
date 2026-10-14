import * as commandService from '../services/commandService.js'
import { publishCommand } from '../mqtt/client.js'
import { HttpError, found } from '../utils/HttpError.js'
import { parseId } from '../utils/validate.js'

const ACTOR = 'Administrator'

export async function postCommand(req, res) {
  const by = typeof req.body?.by === 'string' && req.body.by.trim() ? req.body.by.trim() : ACTOR
  const prepared = found(await commandService.createCommand(parseId(req.params.id), req.body?.value, by), 'Device property')
  try {
    await publishCommand(prepared.topic, prepared.payload)
  } catch (err) {
    await commandService.commandFailed(prepared.command, err.message)
    throw new HttpError(502, `The command could not be sent: ${err.message}`)
  }
  await commandService.commandSent(prepared.command)
  res.status(202).json(prepared.command)
}

export async function getCommands(req, res) {
  res.json(await commandService.listCommands(parseId(req.params.id)))
}
