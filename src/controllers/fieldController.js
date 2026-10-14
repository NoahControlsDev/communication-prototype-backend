import * as fieldService from '../services/fieldService.js'
import { promoteUnapproved } from '../services/dataService.js'
import { HttpError } from '../utils/HttpError.js'
import { parse, text } from '../utils/validate.js'

export async function getFields(req, res) {
  res.json(await fieldService.listFields())
}

export async function postApprove(req, res) {
  const field = parse(req.body, {
    gateway_key: text({ required: true }), device_key: text({ required: true }), key: text({ required: true }),
  })
  const property = await fieldService.approveField(field)
  if (!property) {
    throw new HttpError(400, `${field.device_key} isn't a device on ${field.gateway_key} yet: accept its birth certificate first`)
  }
  res.json({ property, promoted: await promoteUnapproved() })
}
