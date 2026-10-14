import * as connectionService from '../services/connectionService.js'
import { HttpError, found } from '../utils/HttpError.js'
import { parse, parseId, integer } from '../utils/validate.js'

const CONNECTION = {
  from_device_id: integer(),
  from_system_id: integer(),
  to_device_id: integer(),
  to_system_id: integer(),
}

const oneOf = (a, b) => (a === null) !== (b === null)

export async function getConnections(req, res) {
  res.json(await connectionService.listConnections())
}

export async function postConnection(req, res) {
  const c = parse(req.body, CONNECTION)
  if (!oneOf(c.from_device_id, c.from_system_id) || !oneOf(c.to_device_id, c.to_system_id)) {
    throw new HttpError(400, 'Each end of a connection is either a device or a system')
  }
  if (c.from_device_id === null && c.to_device_id === null) {
    throw new HttpError(400, 'At least one end of a connection must be a device')
  }
  res.status(201).json(await connectionService.createConnection(c))
}

export async function deleteConnection(req, res) {
  found(await connectionService.deleteConnection(parseId(req.params.id)), 'Connection')
  res.status(204).end()
}
