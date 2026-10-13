import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import type { UserRole } from '@urbanfix/shared';
import { config } from '../config';

export interface AuthContext {
  id: string;
  role: UserRole;
  isGuest: boolean;
  wardId: string | null;
}

const secret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
const ISSUER = 'urbanfix';

export async function signAccessToken(user: AuthContext): Promise<string> {
  return new SignJWT({ role: user.role, guest: user.isGuest, ward: user.wardId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      role: payload.role as UserRole,
      isGuest: Boolean(payload.guest),
      wardId: (payload.ward as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password).catch(() => false);

/** Opaque refresh token; only its SHA-256 is stored. */
export function generateRefreshToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export const REFRESH_COOKIE = 'uf_refresh';
