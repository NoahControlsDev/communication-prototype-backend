import express from 'express'
import cors from 'cors'
import config from './config/index.js'
import routes from './routes/index.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.use(cors({ origin: config.corsOrigin }))
// Default is 100kb; a pasted gateway birth (dozens of devices × dozens of properties) is bigger.
app.use(express.json({ limit: '10mb' }))

app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

export default app
