import * as connectionService from '../services/connectionService.js'
import { found } from '../utils/HttpError.js'
import { parse, parseId, integer } from '../utils/validate.js'

const CONNECTION = {
  from_device_id: integer({ required: true }),
  to_device_id: integer({ required: true }),
}

export async function getConnections(req, res) {
  res.json(await connectionService.listConnections())
}

export async function postConnection(req, res) {
  res.status(201).json(await connectionService.createConnection(parse(req.body, CONNECTION)))
}

export async function deleteConnection(req, res) {
  found(await connectionService.deleteConnection(parseId(req.params.id)), 'Connection')
  res.status(204).end()
}
