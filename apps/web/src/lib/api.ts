/**
 * Fetch wrapper for the UrbanFix API: attaches the access token, refreshes it
 * once on 401 (single-flight), and turns error bodies into `ApiError`s.
 */
import type { ApiErrorBody, AuthResponse } from '@urbanfix/shared';

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const PREFIX = `${API_BASE}/api/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let onSession: ((s: AuthResponse | null) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
/** The auth store registers here so silent refreshes update it. */
export function onSessionChange(cb: (s: AuthResponse | null) => void) {
  onSession = cb;
}

let refreshing: Promise<AuthResponse | null> | null = null;

export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= fetch(`${PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-requested-with': 'urbanfix' },
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const session = (await res.json()) as AuthResponse;
      accessToken = session.accessToken;
      onSession?.(session);
      return session;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${PREFIX}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return API_BASE ? url.toString() : url.pathname + url.search;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { 'x-requested-with': 'urbanfix' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
    signal: opts.signal,
    credentials: 'include',
  });
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, opts);
    if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
      const session = await refreshSession();
      if (session) res = await send(path, opts);
      else onSession?.(null);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'You appear to be offline. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'ERROR',
      e?.message ?? `Request failed (${res.status})`,
      e?.details,
    );
  }
  return data as T;
}

/** Absolute URL for assets the API serves (uploads). */
export const assetUrl = (url: string) => url;
