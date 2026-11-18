// One-time copy of all AbsoluteCinema data from Supabase Postgres into Neon.
//
// Usage:
//   1. npm run db:schema            (creates the tables in Neon)
//   2. npm run migrate:neon         (copies the data)
//
// Needs two connection strings (in the environment or .env.local):
//   SUPABASE_DB_URL  Supabase dashboard > Connect > "Session pooler" URI (the
//                    direct db.<ref>.supabase.co host is IPv6-only on many networks)
//   DATABASE_URL     Neon connection string
//
// What it does:
//   * keeps every id, so ratings, follows, comments etc. stay linked
//   * copies each person's Google email from Supabase's auth.users into
//     profiles.email; Auth.js matches on it at sign-in, so people land on
//     their existing profile
//   * converts the legacy `top5` array table into `top5_items` when present
//   * is safe to re-run: rows that already exist in Neon are skipped
//   * runs in one Neon transaction, so a failure leaves Neon unchanged
//
// Supabase is only read, never modified.
import pg from 'pg'

// Return dates/timestamps as the raw strings Postgres sends, so nothing shifts by
// the local timezone on the way through JavaScript.
for (const oid of [1082, 1114, 1184]) pg.types.setTypeParser(oid, (value) => value)

const { SUPABASE_DB_URL, DATABASE_URL } = process.env
if (!SUPABASE_DB_URL || !DATABASE_URL) {
  console.error('Set SUPABASE_DB_URL (Supabase session pooler URI) and DATABASE_URL (Neon) first.')
  process.exit(1)
}

// Parent tables before children so foreign keys are satisfied.
const TABLES = [
  'profiles',
  'movies',
  'ratings',
  'follows',
  'top5_items',
  'watchlist',
  'reactions',
  'comments',
  'recommendation_feedback',
  'predictions',
]

// Supabase serves TLS with its own CA; encrypt but don't pin it, unless the URL opts out.
const sourceSsl = /sslmode=disable/.test(SUPABASE_DB_URL) ? false : { rejectUnauthorized: false }
const source = new pg.Client({ connectionString: SUPABASE_DB_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: sourceSsl })
const target = new pg.Client({ connectionString: DATABASE_URL })

async function columns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  )
  return new Map(rows.map((row) => [row.column_name, row.data_type]))
}

async function insertRows(table, cols, rows) {
  let inserted = 0
  const batchSize = Math.max(1, Math.floor(1000 / cols.length))
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize)
    const values = []
    const tuples = batch.map((row, r) => {
      const placeholders = cols.map((col, c) => {
        values.push(row[col])
        return `$${r * cols.length + c + 1}`
      })
      return `(${placeholders.join(', ')})`
    })
    const result = await target.query(
      `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
    inserted += result.rowCount
  }
  return inserted
}

async function main() {
  await source.connect()
  await target.connect()

  // --- Preflight: make sure ids have the types the Neon schema expects.
  const problems = []
  for (const [table, expected] of [
    ['profiles', 'uuid'],
    ['movies', 'uuid'],
    ['ratings', 'uuid'],
  ]) {
    const srcCols = await columns(source, table)
    if (srcCols.size === 0) problems.push(`Supabase has no public.${table} table`)
    else if (srcCols.get('id') !== expected) {
      problems.push(`Supabase ${table}.id is ${srcCols.get('id')}, but the Neon schema expects ${expected}`)
    }
    if ((await columns(target, table)).size === 0) problems.push(`Neon has no ${table} table — run "npm run db:schema" first`)
  }
  if (problems.length) {
    console.error('Stopped before copying anything:\n  - ' + problems.join('\n  - '))
    console.error('If the id types differ, change them in db/schema.sql to match, re-run db:schema, then retry.')
    process.exitCode = 1
    return
  }

  await target.query('BEGIN')
  try {
    for (const table of TABLES) {
      const srcCols = await columns(source, table)
      const dstCols = await columns(target, table)
      if (srcCols.size === 0) {
        console.log(`- ${table}: not in Supabase, skipped`)
        continue
      }
      const shared = [...srcCols.keys()].filter((col) => dstCols.has(col))
      const dropped = [...srcCols.keys()].filter((col) => !dstCols.has(col))

      let rows
      if (table === 'profiles') {
        // Bring the sign-in email across from Supabase Auth.
        const select = shared.filter((col) => col !== 'email').map((col) => `p."${col}"`)
        ;({ rows } = await source.query(
          `SELECT ${select.join(', ')}, u.email FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id`,
        ))
        if (!shared.includes('email')) shared.push('email')
      } else {
        ;({ rows } = await source.query(`SELECT ${shared.map((c) => `"${c}"`).join(', ')} FROM public.${table}`))
      }

      const inserted = await insertRows(table, shared, rows)
      const note = dropped.length ? ` (columns not carried over: ${dropped.join(', ')})` : ''
      console.log(`- ${table}: ${inserted} of ${rows.length} rows copied${note}`)
    }

    // Legacy Top 5 stored as an array on `top5`; convert for users with no top5_items.
    if ((await columns(source, 'top5')).has('movie_ids')) {
      const { rows } = await source.query('SELECT user_id, movie_ids::text[] AS movie_ids FROM public.top5')
      // Decide up front who already has a Top 5 in Neon, so we don't stop after their first pick.
      const { rows: have } = await target.query('SELECT DISTINCT user_id::text AS user_id FROM top5_items')
      const alreadyHas = new Set(have.map((row) => row.user_id))
      let converted = 0
      for (const row of rows) {
        if (alreadyHas.has(String(row.user_id))) continue
        const movieIds = (row.movie_ids || []).slice(0, 5)
        for (const [index, movieId] of movieIds.entries()) {
          const result = await target.query(
            `INSERT INTO top5_items (user_id, rank, movie_id)
             SELECT $1::uuid, $2::smallint, m.id FROM movies m WHERE m.id::text = $3::text
             ON CONFLICT DO NOTHING`,
            [String(row.user_id), index + 1, String(movieId)],
          )
          converted += result.rowCount
        }
      }
      console.log(`- top5 (legacy): ${converted} picks converted`)
    }

    await target.query('COMMIT')
  } catch (error) {
    await target.query('ROLLBACK')
    throw error
  }

  const { rows: missing } = await target.query('SELECT username FROM profiles WHERE email IS NULL')
  if (missing.length) {
    console.warn(
      `\n${missing.length} profile(s) have no email (their Supabase login was deleted): ${missing.map((r) => r.username).join(', ')}.` +
        '\nThey keep their data but cannot sign in until you set profiles.email for them.',
    )
  }
  console.log('\nDone. Neon now has your data; Supabase was not changed.')
}

main()
  .catch((error) => {
    console.error('Migration failed, Neon was rolled back:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await source.end().catch(() => {})
    await target.end().catch(() => {})
  })
