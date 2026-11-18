// One-time fix: early Letterboxd imports saved stars out of 5 on the 0.5–10 scale,
// so a 4.5★ film was stored as 4.5/10. This doubles those ratings.
//
// Only touches ratings still tagged "Imported from Letterboxd", at 5 or below, that
// haven't been edited since import (edits set updated_at, so a rating the user has
// already corrected by hand is left alone).
//
// Usage: npm run db:fix-letterboxd            (dry run: shows what would change)
//        npm run db:fix-letterboxd -- --apply (makes the change)
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Add your Neon connection string to .env.local.')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
const where = `r.description = 'Imported from Letterboxd'
  AND r.rating <= 5
  AND r.updated_at - r.created_at < interval '1 minute'`

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  const preview = await client.query(
    `SELECT p.username, COUNT(*)::int AS n
     FROM ratings r JOIN profiles p ON p.id = r.user_id
     WHERE ${where}
     GROUP BY p.username ORDER BY n DESC`,
  )
  const total = preview.rows.reduce((sum, row) => sum + row.n, 0)
  console.log(`${total} imported Letterboxd rating(s) to double:`)
  for (const row of preview.rows) console.log(`  @${row.username}: ${row.n}`)

  if (!apply) {
    console.log('\nDry run. Nothing changed. Re-run with --apply to update them.')
  } else if (total > 0) {
    const result = await client.query(`UPDATE ratings r SET rating = r.rating * 2, updated_at = NOW() WHERE ${where}`)
    console.log(`\nUpdated ${result.rowCount} rating(s).`)
  }
} finally {
  await client.end()
}
