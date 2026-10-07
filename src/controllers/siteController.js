import * as siteService from '../services/siteService.js'
import { found } from '../utils/HttpError.js'
import { parse, parseId, text } from '../utils/validate.js'

const SYSTEM = { name: text({ required: true }) }
const GATEWAY = { gateway_key: text({ required: true }) }

export async function getSystems(req, res) {
  res.json(await siteService.listSystems())
}

export async function postSystem(req, res) {
  res.status(201).json(await siteService.createSystem(parse(req.body, SYSTEM)))
}

export async function patchSystem(req, res) {
  const data = parse(req.body, SYSTEM, { partial: true })
  res.json(found(await siteService.updateSystem(parseId(req.params.id), data), 'System'))
}

export async function deleteSystem(req, res) {
  found(await siteService.deleteSystem(parseId(req.params.id)), 'System')
  res.status(204).end()
}

export async function getGateways(req, res) {
  res.json(await siteService.listGateways())
}

export async function postGateway(req, res) {
  res.status(201).json(await siteService.createGateway(parse(req.body, GATEWAY)))
}

export async function patchGateway(req, res) {
  const data = parse(req.body, GATEWAY, { partial: true })
  res.json(found(await siteService.updateGateway(parseId(req.params.id), data), 'Gateway'))
}

export async function deleteGateway(req, res) {
  found(await siteService.deleteGateway(parseId(req.params.id)), 'Gateway')
  res.status(204).end()
}
