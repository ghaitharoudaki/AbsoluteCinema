// Creates (or updates) the AbsoluteCinema tables in Neon from db/schema.sql.
// Usage: npm run db:schema   (reads DATABASE_URL from the environment or .env.local)
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Add your Neon connection string to .env.local.')
  process.exit(1)
}

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(schema)
  console.log('Schema applied to Neon.')
} finally {
  await client.end()
}
