import { Router } from 'express'
import * as c from '../controllers/dataController.js'

const router = Router()

router.get('/latest', c.getLatest)
router.get('/unapproved', c.getUnapproved)
router.post('/unapproved/delete', c.postDeleteUnapproved)
router.post('/promote', c.postPromote)
router.get('/declined', c.getDeclined)
router.post('/declined', c.postDecline)
router.delete('/declined/:id', c.deleteDeclined)
router.post('/', c.postData)
router.get('/properties/:id/history', c.getHistory)
router.get('/devices/:id/series', c.getDeviceSeries)
router.get('/stats', c.getStats)

export default router
