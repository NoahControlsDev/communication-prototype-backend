import app from './app.js'
import config from './config/index.js'
import { startRetention } from './services/dataService.js'
import './mqtt/client.js'

startRetention() // delete not-approved data older than 24 h

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (${config.env})`)
})
