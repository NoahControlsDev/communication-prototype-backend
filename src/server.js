import app from './app.js'
import config from './config/index.js'
import { startRetention } from './services/dataService.js'
import { reconcileOffline } from './services/alertService.js'
import './mqtt/client.js'

startRetention()
reconcileOffline().catch((err) => console.error(`Offline reconcile failed: ${err.message}`))

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (${config.env})`)
})
