import type { FastifyRequest } from 'fastify';
import { type DbOrTx, schema } from '../db/client';

export async function audit(
  db: DbOrTx,
  request: FastifyRequest | null,
  entry: { action: string; entityType: string; entityId?: string | null; diff?: Record<string, unknown> },
) {
  await db.insert(schema.auditLogs).values({
    actorId: request?.auth?.id ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    diff: entry.diff ?? {},
    ip: request?.ip ?? null,
  });
}
