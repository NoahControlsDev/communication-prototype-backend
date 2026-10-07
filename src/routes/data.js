import { Router } from 'express'
import * as c from '../controllers/dataController.js'

const router = Router()

router.get('/latest', c.getLatest)                          // in the system: latest value per property
router.get('/unapproved', c.getUnapproved)                  // not approved: summary per point + reason
router.post('/unapproved/delete', c.postDeleteUnapproved)   // { gateway_key?, device_key?, key?, reason? }
router.post('/promote', c.postPromote)                      // re-check held values against approvals
router.get('/declined', c.getDeclined)                      // declined rules + declined-certificate devices
router.post('/declined', c.postDecline)                     // { gateway_key, device_key, key? }: drop from now on
router.delete('/declined/:id', c.deleteDeclined)            // undo a declined rule
router.post('/', c.postData)                                // manual message { gateway_key, payload }
router.get('/properties/:id/history', c.getHistory)         // ?range=15m|1h|6h|24h|7d, bucketed
router.get('/devices/:id/series', c.getDeviceSeries)        // every approved property, for small multiples
router.get('/stats', c.getStats)                            // values per bucket: stored vs held

export default router
