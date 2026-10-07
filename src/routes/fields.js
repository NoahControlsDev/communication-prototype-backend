import { Router } from 'express'
import * as c from '../controllers/fieldController.js'

const router = Router()

router.get('/', c.getFields)              // every known field with its state
router.post('/approve', c.postApprove)    // { gateway_key, device_key, key }

export default router
