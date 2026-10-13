import type { FastifyReply, FastifyRequest } from 'fastify';
import { MUNICIPAL_ROLES, type UserRole } from '@urbanfix/shared';
import { type AuthContext, verifyAccessToken } from './auth';
import { forbidden, unauthorized } from './errors';
import { redis, redisKeys } from './redis';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Populates `request.auth` when a valid token is present. Never rejects. */
export async function resolveAuth(request: FastifyRequest) {
  request.auth = null;
  const token = bearer(request);
  if (!token) return;
  const ctx = await verifyAccessToken(token);
  if (!ctx) return;
  if (await redis.sismember(redisKeys.suspended, ctx.id)) return;
  request.auth = ctx;
}

/** preHandler: the request must be authenticated (guests included). */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.auth) throw unauthorized();
}

/** preHandler factory: the request must come from one of the given roles. */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.auth) throw unauthorized();
    if (!roles.includes(request.auth.role)) throw forbidden();
  };
}

export const requireMunicipal = requireRole(...MUNICIPAL_ROLES);
export const requireTriage = requireRole('OFFICIAL', 'ADMIN');
export const requireAdmin = requireRole('ADMIN');

/** preHandler: registered (non-guest) account required. */
export async function requireAccount(request: FastifyRequest) {
  if (!request.auth) throw unauthorized();
  if (request.auth.isGuest) throw forbidden('Create an account to do this');
}

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
