import * as certService from '../services/birthCertificateService.js'
import { HttpError, found } from '../utils/HttpError.js'
import { parse, parseId, text, integer } from '../utils/validate.js'
import { PROFILE, PROPERTY } from '../schemas.js'
import { promoteUnapproved } from '../services/dataService.js'

const STATUSES = ['pending', 'accepted', 'declined']

const ACCEPT = {
  device_key: text(),
  name: text(),
  site_tag: text(),
  gateway_key: text(),
}

export async function getCertificates(req, res) {
  const { status } = req.query
  if (status && !STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`)
  res.json(await certService.listCertificates(status))
}

export async function getCertificate(req, res) {
  res.json(found(await certService.getCertificate(parseId(req.params.id)), 'Birth certificate'))
}

// Manual submission: a gateway birth message or a single device object. Useful for testing.
export async function postCertificate(req, res) {
  const { topic, payload } = req.body ?? {}
  const certificates = await certService.ingest(typeof topic === 'string' ? topic : null, payload)
  if (certificates.some((c) => c.result === 'auto_accepted')) await promoteUnapproved()
  res.status(201).json({ certificates })
}

// profile: { mode: 'existing', profile_id } | { mode: 'new', key, major, minor, properties: [...] }
function parseProfileDecision(p = {}) {
  if (p.mode === 'new') {
    if (!Array.isArray(p.properties)) throw new HttpError(400, 'profile.properties must be a list')
    return { mode: 'new', data: { ...parse(p, PROFILE), properties: p.properties.map((prop) => parse(prop, PROPERTY)) } }
  }
  if (p.mode === 'existing') {
    return { mode: 'existing', profile_id: integer({ required: true })(p.profile_id, 'profile.profile_id') }
  }
  return { mode: 'none' } // fine when the device already exists; the service checks
}

function parseIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'ids must be a non-empty list')
  return [...new Set(ids.map(parseId))]
}

// Body: { device_key?, name?, site_tag?, gateway_key?, profile }
// profile is ignored when a device with this key already exists.
export async function postAccept(req, res) {
  const decision = { ...parse(req.body, ACCEPT), profile: parseProfileDecision(req.body?.profile) }
  const result = await certService.accept(parseId(req.params.id), decision)
  res.json({ ...result, promoted: await promoteUnapproved() })
}

// Body: { ids: [...], profile } → every certificate accepted onto the same profile, all or nothing.
export async function postAcceptMany(req, res) {
  const ids = parseIds(req.body?.ids)
  const accepted = await certService.acceptMany(ids, parseProfileDecision(req.body?.profile))
  res.json({ accepted, promoted: await promoteUnapproved() })
}

// Body: { ids: [...] }
export async function postDeclineMany(req, res) {
  res.json({ declined: await certService.declineMany(parseIds(req.body?.ids)) })
}

// Body: { ids: [...] }: declined → pending again
export async function postReopenMany(req, res) {
  res.json({ reopened: await certService.reopenMany(parseIds(req.body?.ids)) })
}

// Body: { ids: [...] }: deletes the records; a resend shows up as a new certificate
export async function postDeleteMany(req, res) {
  res.json({ deleted: await certService.deleteMany(parseIds(req.body?.ids)) })
}

export async function postReopen(req, res) {
  const reopened = await certService.reopenMany([parseId(req.params.id)])
  if (!reopened) throw new HttpError(409, 'Only declined certificates can be reopened')
  res.json({ reopened })
}

export async function deleteCertificate(req, res) {
  found(await certService.deleteMany([parseId(req.params.id)]), 'Birth certificate')
  res.status(204).end()
}

export async function postDeclineAll(req, res) {
  res.json({ declined: await certService.declineAll() })
}

export async function postDecline(req, res) {
  res.json(await certService.decline(parseId(req.params.id)))
}
