import { Router } from 'express'
import * as c from '../controllers/birthCertificateController.js'

const router = Router()

router.get('/', c.getCertificates)
router.post('/', c.postCertificate)
router.post('/decline-all', c.postDeclineAll)
router.post('/accept-many', c.postAcceptMany)
router.post('/decline-many', c.postDeclineMany)
router.post('/reopen-many', c.postReopenMany)
router.post('/delete-many', c.postDeleteMany)
router.get('/:id', c.getCertificate)
router.delete('/:id', c.deleteCertificate)
router.post('/:id/accept', c.postAccept)
router.post('/:id/decline', c.postDecline)
router.post('/:id/reopen', c.postReopen)

export default router
