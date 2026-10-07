// Runs node-pg-migrate with the same connection settings as the app (src/config).
// Usage: npm run migrate:up            apply all pending migrations
//        npm run migrate:down          roll back the most recent migration
//        npm run migrate:down -- 3     roll back the last 3
import { runner } from 'node-pg-migrate'
import config from '../src/config/index.js'

const direction = process.argv[2]
if (direction !== 'up' && direction !== 'down') {
  console.error('Usage: node scripts/migrate.js <up|down> [count]')
  process.exit(1)
}

const count = process.argv[3] ? Number(process.argv[3]) : direction === 'up' ? Infinity : 1

await runner({
  databaseUrl: config.db,
  dir: 'migrations',
  migrationsTable: 'pgmigrations',
  direction,
  count,
  checkOrder: true,
})
