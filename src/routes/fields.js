import { Router } from 'express'
import * as c from '../controllers/fieldController.js'

const router = Router()

router.get('/', c.getFields)
router.post('/approve', c.postApprove)

export default router
