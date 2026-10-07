import { Router } from 'express'
import profiles from './profiles.js'
import devices from './devices.js'
import birthCertificates from './birthCertificates.js'
import data from './data.js'
import fields from './fields.js'
import connections from './connections.js'
import { getEnums } from '../controllers/profileController.js'
import * as site from '../controllers/siteController.js'

const router = Router()

router.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

router.get('/enums', getEnums)
router.use('/profiles', profiles)
router.use('/devices', devices)
router.use('/birth-certificates', birthCertificates)
router.use('/data', data)
router.use('/fields', fields)
router.use('/connections', connections)

router.get('/systems', site.getSystems)
router.post('/systems', site.postSystem)
router.patch('/systems/:id', site.patchSystem)
router.delete('/systems/:id', site.deleteSystem)

router.get('/gateways', site.getGateways)
router.post('/gateways', site.postGateway)
router.patch('/gateways/:id', site.patchGateway)
router.delete('/gateways/:id', site.deleteGateway)

export default router
