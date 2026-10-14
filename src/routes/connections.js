import { Router } from 'express'
import * as c from '../controllers/connectionController.js'

const router = Router()

router.get('/', c.getConnections)
router.post('/', c.postConnection)
router.delete('/:id', c.deleteConnection)

export default router
