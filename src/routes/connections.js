import { Router } from 'express'
import * as c from '../controllers/connectionController.js'

const router = Router()

router.get('/', c.getConnections)
router.post('/', c.postConnection)        // { from_device_id, to_device_id }: supply → return
router.delete('/:id', c.deleteConnection)

export default router
