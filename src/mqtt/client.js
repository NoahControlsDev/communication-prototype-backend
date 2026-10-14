import mqtt from 'mqtt'
import config from '../config/index.js'
import { ingest, BIRTH_TOPIC } from '../services/birthCertificateService.js'
import { getGatewayStatus, setGatewayStatus } from '../services/siteService.js'
import { evaluateGateway, gatewayStatusChanged } from '../services/alertService.js'
import { recordAck, COMMAND_ACK_TOPIC, COMMAND_TOPIC } from '../services/commandService.js'
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

async function handleStatus(gatewayKey, text) {
  let status
  try { status = JSON.parse(text).status } catch { status = text.trim() }
  status = String(status).toLowerCase()
  if (status !== 'online' && status !== 'offline') {
    console.error(`Ignored status "${text}" from gateway ${gatewayKey}`)
    return
  }
  const before = await getGatewayStatus(gatewayKey)
  await setGatewayStatus(gatewayKey, status)
  if (before !== status) await gatewayStatusChanged(gatewayKey, status)
  console.log(`Gateway ${gatewayKey} is ${status}`)
}

async function handleBirth(topic, text) {
  const results = await ingest(topic, JSON.parse(text))
  const count = (r) => results.filter((x) => x.result === r).length
  console.log(`Birth from ${topic}: ${results.length} device(s), ${count('auto_accepted')} auto-accepted, ` +
    `${count('new')} new, ${count('updated')} updated, ${count('unchanged')} unchanged`)
  if (count('auto_accepted')) await promoteUnapproved()
}

async function handleData(gatewayKey, text) {
  const r = await ingestData(gatewayKey, JSON.parse(text))
  const alerts = await evaluateGateway(gatewayKey)
  const held = Object.entries(r.unapproved).map(([reason, n]) => `${n} ${reason}`).join(', ')
  console.log(`Data from ${gatewayKey}: ${r.stored} stored` +
    (r.duplicates ? `, ${r.duplicates} duplicate` : '') + (held ? `, held: ${held}` : '') +
    (r.dropped ? `, ${r.dropped} declined (dropped)` : '') +
    (alerts.raised ? `, ${alerts.raised} alert(s) raised` : '') + (alerts.resolved ? `, ${alerts.resolved} alert(s) resolved` : ''))
}

async function handleAck(gatewayKey, text) {
  const command = await recordAck(gatewayKey, JSON.parse(text))
  if (command) console.log(`Command ${command.id} ${command.status} by ${gatewayKey}: ${command.key} = ${command.value}`)
}

export async function publishCommand(topic, payload) {
  if (!client.connected) throw new Error('not connected to the MQTT broker')
  await client.publishAsync(topic, JSON.stringify(payload), { qos: 1, retain: false })
}

client.on('message', async (topic, payload) => {
  const text = payload.toString()
  if (!text) return

  try {
    const status = topic.match(STATUS_TOPIC)
    if (status) return await handleStatus(status[1], text)
    if (BIRTH_TOPIC.test(topic)) return await handleBirth(topic, text)
    const data = topic.match(DATA_TOPIC)
    if (data) return await handleData(data[1], text)
    const ack = topic.match(COMMAND_ACK_TOPIC)
    if (ack) return await handleAck(ack[1], text)
    if (COMMAND_TOPIC.test(topic)) return
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
