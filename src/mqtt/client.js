import mqtt from 'mqtt'
import config from '../config/index.js'
import { ingest, BIRTH_TOPIC } from '../services/birthCertificateService.js'
import { setGatewayStatus } from '../services/siteService.js'
import { ingestData, DATA_TOPIC, promoteUnapproved } from '../services/dataService.js'

const STATUS_TOPIC = /^bas\/([^/]+)\/status$/

const client = mqtt.connect(config.mqttUrl, {
  username: config.mqttUsername,
  password: config.mqttPassword,
})

client.on('connect', () => {
  console.log(`MQTT connected to ${config.mqttUrl}`)
  client.subscribe('bas/#')
})

// bas/<GATEWAY_ID>/status: {"status":"online"|"offline"} (plain "online"/"offline" also accepted)
async function handleStatus(gatewayKey, text) {
  let status
  try { status = JSON.parse(text).status } catch { status = text.trim() }
  status = String(status).toLowerCase()
  if (status !== 'online' && status !== 'offline') {
    console.error(`Ignored status "${text}" from gateway ${gatewayKey}`)
    return
  }
  await setGatewayStatus(gatewayKey, status)
  console.log(`Gateway ${gatewayKey} is ${status}`)
}

// bas/<GATEWAY_ID>/birth: one certificate per device for the admin's review tab
async function handleBirth(topic, text) {
  const results = await ingest(topic, JSON.parse(text))
  const count = (r) => results.filter((x) => x.result === r).length
  console.log(`Birth from ${topic}: ${results.length} device(s), ${count('auto_accepted')} auto-accepted, ` +
    `${count('new')} new, ${count('updated')} updated, ${count('unchanged')} unchanged`)
  // Data may have arrived before the birth; move it in for the devices just created.
  if (count('auto_accepted')) await promoteUnapproved()
}

// bas/<GATEWAY_ID>/data: values sorted into readings (approved) or held (not approved yet)
async function handleData(gatewayKey, text) {
  const r = await ingestData(gatewayKey, JSON.parse(text))
  const held = Object.entries(r.unapproved).map(([reason, n]) => `${n} ${reason}`).join(', ')
  console.log(`Data from ${gatewayKey}: ${r.stored} stored` +
    (r.duplicates ? `, ${r.duplicates} duplicate` : '') + (held ? `, held: ${held}` : '') +
    (r.dropped ? `, ${r.dropped} declined (dropped)` : ''))
}

client.on('message', async (topic, payload) => {
  const text = payload.toString()
  if (!text) return // empty payload = a retained message being cleared

  try {
    const status = topic.match(STATUS_TOPIC)
    if (status) return await handleStatus(status[1], text)
    if (BIRTH_TOPIC.test(topic)) return await handleBirth(topic, text)
    const data = topic.match(DATA_TOPIC)
    if (data) return await handleData(data[1], text)
  } catch (err) {
    console.error(`Rejected message on ${topic}: ${err.message}`)
    return
  }

  console.log(`MQTT ${topic}: ${text.slice(0, 300)}`)
})

client.on('error', (err) => {
  console.error('MQTT error:', err.message)
})

export default client
