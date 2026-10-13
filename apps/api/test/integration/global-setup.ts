/** Recreates the test database schema once per run. */
export default async function setup() {
  // globalSetup runs outside the test workers, so set the connection settings here too.
  process.env.NODE_ENV = 'test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgres://urbanfix:urbanfix@localhost:5432/urbanfix_test';
  const { sql } = await import('drizzle-orm');
  const { db, pool } = await import('../../src/db/client');
  const { runMigrations } = await import('../../src/db/migrate');
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await runMigrations();
  await pool.end();
  const { redis } = await import('../../src/core/redis');
  redis.disconnect();
}
