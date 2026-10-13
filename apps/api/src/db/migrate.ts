import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config';
import { db } from './client';

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(config.apiRoot, 'drizzle') });
}
