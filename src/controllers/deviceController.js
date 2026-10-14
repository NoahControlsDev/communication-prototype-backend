import * as deviceService from '../services/deviceService.js'
import { HttpError, found } from '../utils/HttpError.js'
import { promoteUnapproved } from '../services/dataService.js'
import { parse, parseId, text, number, integer, bool } from '../utils/validate.js'

const DEVICE_CREATE = {
  device_key: text({ required: true }),
  name: text({ required: true }),
  site_tag: text(),
  gateway_id: integer({ required: true }),
  profile_id: integer({ required: true }),
}

const DEVICE_UPDATE = {
  device_key: text({ required: true }),
  name: text({ required: true }),
  site_tag: text(),
  gateway_id: integer({ required: true }),
  system_id: integer(),
  status: text({ required: true }),
  map_x: integer(),
  map_y: integer(),
}

const EXTENSION = {
  key: text({ required: true }),
}

const DEVICE_PROPERTY_UPDATE = {
  approved: bool({ required: true }),
  min_override: number(),
  max_override: number(),
  writable_override: bool(),
}

export async function getDevices(req, res) {
  res.json(await deviceService.listDevices())
}

export async function getDevice(req, res) {
  res.json(found(await deviceService.getDevice(parseId(req.params.id)), 'Device'))
}

export async function postDevice(req, res) {
  const device = await deviceService.createDevice(parse(req.body, DEVICE_CREATE))
  await promoteUnapproved()
  res.status(201).json(await deviceService.getDevice(device.id))
}

export async function patchDevice(req, res) {
  const data = parse(req.body, DEVICE_UPDATE, { partial: true })
  if (data.status === 'pending' && !('system_id' in data)) data.system_id = null
  const device = found(await deviceService.updateDevice(parseId(req.params.id), data), 'Device')
  if ('gateway_id' in data || 'device_key' in data) await promoteUnapproved()
  res.json(device)
}

export async function deleteDevice(req, res) {
  found(await deviceService.deleteDevice(parseId(req.params.id)), 'Device')
  res.status(204).end()
}

export async function postSync(req, res) {
  const id = parseId(req.params.id)
  found(await deviceService.getDevice(id), 'Device')
  const added = await deviceService.syncProperties(id)
  await promoteUnapproved()
  res.json({ added, device: await deviceService.getDevice(id) })
}

export async function postExtension(req, res) {
  const deviceId = parseId(req.params.id)
  found(await deviceService.getDevice(deviceId), 'Device')
  res.status(201).json(await deviceService.addExtension(deviceId, parse(req.body, EXTENSION)))
}

export async function patchDeviceProperty(req, res) {
  const data = parse(req.body, DEVICE_PROPERTY_UPDATE, { partial: true })
  const property = found(await deviceService.updateDeviceProperty(parseId(req.params.id), data), 'Device property')
  if (data.approved) await promoteUnapproved()
  res.json(property)
}

export async function deleteDeviceProperty(req, res) {
  const result = await deviceService.deleteDeviceProperty(parseId(req.params.id))
  found(result !== 'missing', 'Device property')
  if (result === 'standard') {
    throw new HttpError(400, "Standard properties come from the profile and can't be deleted")
  }
  res.status(204).end()
}
