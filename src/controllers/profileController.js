import * as profileService from '../services/profileService.js'
import { found } from '../utils/HttpError.js'
import { parse, parseId, bool, jsonObject } from '../utils/validate.js'
import { PROFILE, PROPERTY } from '../schemas.js'

export async function getEnums(req, res) {
  res.json(await profileService.listEnums())
}

export async function getProfiles(req, res) {
  res.json(await profileService.listProfiles())
}

export async function postProfile(req, res) {
  res.status(201).json(await profileService.createProfile(parse(req.body, PROFILE)))
}

const PROFILE_UPDATE = { ...PROFILE, auto_accept: bool({ required: true }), display: jsonObject() }

export async function patchProfile(req, res) {
  const data = parse(req.body, PROFILE_UPDATE, { partial: true })
  res.json(found(await profileService.updateProfile(parseId(req.params.id), data), 'Profile'))
}

export async function deleteProfile(req, res) {
  found(await profileService.deleteProfile(parseId(req.params.id)), 'Profile')
  res.status(204).end()
}

export async function getProperties(req, res) {
  const profileId = parseId(req.params.id)
  found(await profileService.profileExists(profileId), 'Profile')
  res.json(await profileService.listProperties(profileId))
}

export async function postProperty(req, res) {
  const profileId = parseId(req.params.id)
  found(await profileService.profileExists(profileId), 'Profile')
  res.status(201).json(await profileService.createProperty(profileId, parse(req.body, PROPERTY)))
}

export async function patchProperty(req, res) {
  const data = parse(req.body, PROPERTY, { partial: true })
  res.json(found(await profileService.updateProperty(parseId(req.params.id), data), 'Property'))
}

export async function deleteProperty(req, res) {
  found(await profileService.deleteProperty(parseId(req.params.id)), 'Property')
  res.status(204).end()
}
