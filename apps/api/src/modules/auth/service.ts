import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput, UpgradeGuestInput } from '@urbanfix/shared';
import { config } from '../../config';
import {
  REFRESH_COOKIE,
  generateRefreshToken,
  hashPassword,
  sha256,
  signAccessToken,
  verifyPassword,
} from '../../core/auth';
import { AppError, conflict, forbidden, unauthorized } from '../../core/errors';
import { redis, redisKeys } from '../../core/redis';
import { db, schema } from '../../db/client';
import { isoOrNow } from '../../lib/format';

type UserRow = typeof schema.users.$inferSelect;
const { users, refreshTokens } = schema;

export function toAuthUser(u: UserRow): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isGuest: u.isGuest,
    wardId: u.wardId,
    avatarUrl: u.avatarUrl,
    reputation: u.reputation,
    createdAt: isoOrNow(u.createdAt),
  };
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400,
});

async function issueSession(
  user: UserRow,
  request: FastifyRequest,
  reply: FastifyReply,
  familyId: string = randomUUID(),
): Promise<AuthResponse & { refreshTokenId: string }> {
  const { token, hash } = generateRefreshToken();
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId: user.id,
      familyId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 300),
    })
    .returning({ id: refreshTokens.id });
  reply.setCookie(REFRESH_COOKIE, token, cookieOptions());
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
  const accessToken = await signAccessToken({
    id: user.id,
    role: user.role,
    isGuest: user.isGuest,
    wardId: user.wardId,
  });
  return {
    user: toAuthUser(user),
    accessToken,
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenId: row!.id,
  };
}

const strip = ({ refreshTokenId: _r, ...rest }: AuthResponse & { refreshTokenId: string }): AuthResponse =>
  rest;

export async function register(input: RegisterInput, request: FastifyRequest, reply: FastifyReply) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  return strip(await issueSession(user!, request, reply));
}

export async function login(input: LoginInput, request: FastifyRequest, reply: FastifyReply) {
  const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  // Verify against a dummy hash when the user is unknown so timing doesn't reveal which emails exist.
  const ok = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyPassword(DUMMY_HASH, input.password).then(() => false);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  if (user.status === 'SUSPENDED') throw forbidden('This account has been suspended');
  return strip(await issueSession(user, request, reply));
}

// A real argon2id hash of a random throwaway string, so failed lookups cost the same as real ones.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$Wa2HdIJsRKFGDLAfgTN7dA$TtkPZlvE/o0glcXQtGe+IB5k+p+C1tJaWwJNZ2x2kKY';

export async function createGuest(name: string | undefined, request: FastifyRequest, reply: FastifyReply) {
  const [user] = await db
    .insert(users)
    .values({ name: name?.trim() || 'Guest', isGuest: true })
    .returning();
  return strip(await issueSession(user!, request, reply));
}

/**
 * Rotates the refresh token. Presenting a token that was already rotated means
 * it leaked: the whole token family is revoked and the user must sign in again.
 */
export async function refresh(request: FastifyRequest, reply: FastifyReply): Promise<AuthResponse> {
  const token = request.cookies[REFRESH_COOKIE];
  if (!token) throw unauthorized('Session expired');
  const row = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, sha256(token)) });
  if (!row) throw unauthorized('Session expired');

  if (row.revokedAt) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
    request.log.warn({ userId: row.userId, familyId: row.familyId }, 'refresh token reuse detected');
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    throw unauthorized('Session expired');
  }
  if (row.expiresAt < new Date()) throw unauthorized('Session expired');

  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  if (!user || user.status === 'SUSPENDED') throw unauthorized('Session expired');

  const session = await issueSession(user, request, reply, row.familyId);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedById: session.refreshTokenId })
    .where(eq(refreshTokens.id, row.id));
  return strip(session);
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[REFRESH_COOKIE];
  if (token) {
    const row = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, sha256(token)) });
    if (row) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
    }
  }
  reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

/** Turns a guest into a full account, keeping every report, support and notification. */
export async function upgradeGuest(
  userId: string,
  input: UpgradeGuestInput,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw unauthorized();
  if (!user.isGuest) throw conflict('ALREADY_REGISTERED', 'This account is already registered');
  const taken = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (taken) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  const [updated] = await db
    .update(users)
    .set({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      isGuest: false,
    })
    .where(eq(users.id, userId))
    .returning();
  return strip(await issueSession(updated!, request, reply));
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw unauthorized();
  return toAuthUser(user);
}

/** Suspends or reinstates: suspended users lose their sessions and are rejected on every request. */
export async function setSuspended(userId: string, suspended: boolean) {
  if (suspended) {
    await redis.sadd(redisKeys.suspended, userId);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  } else {
    await redis.srem(redisKeys.suspended, userId);
  }
}
