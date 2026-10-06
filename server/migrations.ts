import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from 'pg'
import { config } from './config'
import { logger } from './logger'

export async function runMigrations(connectionString = config.databaseUrl) {
  if (!connectionString) throw new Error('DATABASE_URL is required to run migrations.')
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 5_000,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  })
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const migrationDirectory = join(process.cwd(), 'database', 'migrations')
    const files = (await readdir(migrationDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort()
    for (const file of files) {
      const version = file.split('_')[0]
      const alreadyApplied = await client.query(`SELECT 1 FROM schema_migrations WHERE version = $1`, [version])
      if (alreadyApplied.rowCount) continue
      const sql = await readFile(join(migrationDirectory, file), 'utf8')
      logger.info('migration_start', { version, file })
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [version])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
      logger.info('migration_complete', { version, file })
    }
  } finally {
    client.release()
    await pool.end()
  }
}

if (process.argv[1]?.endsWith('migrations.ts')) {
  runMigrations().then(() => logger.info('migrations_complete')).catch((error) => {
    logger.error('migrations_failed', { error: error instanceof Error ? error.message : String(error) })
    process.exitCode = 1
  })
}
