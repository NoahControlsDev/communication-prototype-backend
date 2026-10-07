import { Router } from 'express'
import * as c from '../controllers/birthCertificateController.js'

const router = Router()

router.get('/', c.getCertificates)       // ?status=pending|accepted|declined
router.post('/', c.postCertificate)      // manual submission { topic?, payload }
router.post('/decline-all', c.postDeclineAll)
router.post('/accept-many', c.postAcceptMany)   // { ids, profile }
router.post('/decline-many', c.postDeclineMany) // { ids }
router.post('/reopen-many', c.postReopenMany)   // { ids } declined → pending
router.post('/delete-many', c.postDeleteMany)   // { ids }
router.get('/:id', c.getCertificate)
router.delete('/:id', c.deleteCertificate)
router.post('/:id/accept', c.postAccept)
router.post('/:id/decline', c.postDecline)
router.post('/:id/reopen', c.postReopen)

export default router
