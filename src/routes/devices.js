import { Router } from 'express'
import * as c from '../controllers/deviceController.js'
import { postCommand, getCommands } from '../controllers/commandController.js'

const router = Router()

router.get('/', c.getDevices)
router.post('/', c.postDevice)
router.get('/:id', c.getDevice)
router.patch('/:id', c.patchDevice)
router.delete('/:id', c.deleteDevice)
router.post('/:id/sync', c.postSync)
router.get('/:id/commands', getCommands)

router.post('/:id/properties', c.postExtension)
router.patch('/properties/:id', c.patchDeviceProperty)
router.delete('/properties/:id', c.deleteDeviceProperty)
router.post('/properties/:id/command', postCommand)

export default router
