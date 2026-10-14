const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5300',
  db: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5433,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  },
  mqttUrl: process.env.MQTT_URL,
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  mqttGatewayUsername: process.env.MQTT_GATEWAY_USERNAME || process.env.MQTT_USERNAME,
  mqttGatewayPassword: process.env.MQTT_GATEWAY_PASSWORD || process.env.MQTT_PASSWORD,
  unapprovedRetentionHours: Number(process.env.UNAPPROVED_RETENTION_HOURS) || 24,
}

const required = [
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'MQTT_URL',
  'MQTT_USERNAME',
  'MQTT_PASSWORD',
]

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} is not set. Check your .env file`)
  }
}

export default config
