import { Router } from 'express'
import * as c from '../controllers/alertController.js'

const router = Router()

router.get('/', c.getAlerts)
router.post('/:id/acknowledge', c.postAcknowledge)
router.post('/:id/silence', c.postSilence)
router.post('/:id/clear', c.postClear)

export default router
