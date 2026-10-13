import { eq } from 'drizzle-orm';
import { DEFAULT_VERIFICATION_SETTINGS, type AppSettings } from '@urbanfix/shared';
import { redis, redisKeys } from '../core/redis';
import { db, schema } from '../db/client';

const KEY = 'verification';

/** Admin-editable workflow settings, cached in Redis for 60 s. */
export async function getSettings(): Promise<AppSettings> {
  const cached = await redis.get(redisKeys.settings);
  if (cached) return JSON.parse(cached) as AppSettings;
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY));
  const settings = { ...DEFAULT_VERIFICATION_SETTINGS, ...((row?.value as Partial<AppSettings>) ?? {}) };
  await redis.set(redisKeys.settings, JSON.stringify(settings), 'EX', 60);
  return settings;
}

export async function saveSettings(value: AppSettings, actorId: string) {
  await db
    .insert(schema.appSettings)
    .values({ key: KEY, value, updatedById: actorId })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedById: actorId } });
  await redis.del(redisKeys.settings);
}
