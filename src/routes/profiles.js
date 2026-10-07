import { Router } from 'express'
import * as c from '../controllers/profileController.js'

const router = Router()

router.get('/', c.getProfiles)
router.post('/', c.postProfile)
router.patch('/:id', c.patchProfile)
router.delete('/:id', c.deleteProfile)

router.get('/:id/properties', c.getProperties)
router.post('/:id/properties', c.postProperty)
router.patch('/properties/:id', c.patchProperty)
router.delete('/properties/:id', c.deleteProperty)

export default router
