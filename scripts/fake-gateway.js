// A fake second gateway with one device of type DualTemp-1@1.0 (same as DualTemp Zone1),
// for testing auto-accept and data flow without real hardware.
//
//   npm run fake-gateway                       # GW-TEST-02 / TestSite.DualTemp.Zone1
//   npm run fake-gateway -- GW-X Site.Zone9    # other gateway id / device key
//
// It behaves like the Node-RED flow: connects with a Last Will, publishes a retained
// "online" status and a retained birth declaring the type, then a data message every
// 10 s. Ctrl+C disconnects cleanly and marks the gateway offline.
import mqtt from 'mqtt'
import config from '../src/config/index.js'

const GATEWAY_ID = process.argv[2] ?? 'GW-TEST-02'
const DEVICE_KEY = process.argv[3] ?? 'TestSite.DualTemp.Zone1'
const TYPE = 'DualTemp-1@1.0'
const EVERY_MS = 10_000

const statusTopic = `bas/${GATEWAY_ID}/status`
const status = (s) => JSON.stringify({ status: s, gateway: GATEWAY_ID })

// Same property set as the DualTemp-1@1.0 profile.
const properties = ['PumpAOutState', 'PumpBOutState', 'PumpRotateState', 'PumpRunning']
  .map((key) => ({ key, type: 'int', acquisition: 'cov', writable: false }))

const client = mqtt.connect(config.mqttUrl, {
  username: config.mqttUsername,
  password: config.mqttPassword,
  clientId: `fake-${GATEWAY_ID}`,
  will: { topic: statusTopic, payload: status('offline'), qos: 1, retain: true },
})

// Pumps that occasionally change state, so the charts have something to show.
const state = { PumpAOutState: 2, PumpBOutState: 1, PumpRotateState: 1, PumpRunning: 2 }
const tick = () => {
  if (Math.random() < 0.3) state.PumpRotateState = state.PumpRotateState === 1 ? 2 : 1
  state.PumpRunning = state.PumpRotateState === 1 ? 2 : 1
  state.PumpAOutState = state.PumpRotateState === 1 ? 2 : 1
  state.PumpBOutState = state.PumpRotateState === 1 ? 1 : 2
  return { timestamp: new Date().toISOString(), devices: { [DEVICE_KEY]: { ...state } } }
}

let timer
client.on('connect', async () => {
  await client.publishAsync(statusTopic, status('online'), { qos: 1, retain: true })
  await client.publishAsync(`bas/${GATEWAY_ID}/birth`, JSON.stringify({
    gateway: GATEWAY_ID,
    timestamp: new Date().toISOString(),
    devices: [{ device_key: DEVICE_KEY, name: 'Test DualTemp Zone1', type: TYPE, properties }],
  }), { qos: 1, retain: true })
  console.log(`${GATEWAY_ID} online, birth published: ${DEVICE_KEY} as ${TYPE}`)

  const send = async () => {
    const msg = tick()
    await client.publishAsync(`bas/${GATEWAY_ID}/data`, JSON.stringify(msg), { qos: 1 })
    console.log(`data ${msg.timestamp}`, msg.devices[DEVICE_KEY])
  }
  clearInterval(timer)
  await send()
  timer = setInterval(send, EVERY_MS)
})

client.on('error', (err) => console.error('MQTT error:', err.message))

process.on('SIGINT', async () => {
  clearInterval(timer)
  await client.publishAsync(statusTopic, status('offline'), { qos: 1, retain: true })
  await client.endAsync()
  console.log(`${GATEWAY_ID} offline`)
  process.exit(0)
})
