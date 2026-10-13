/**
 * Realtime fan-out. The API process owns the Socket.IO server; the worker
 * publishes through the Redis emitter, and the Redis adapter delivers to
 * whichever API replica holds the socket.
 */
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { MUNICIPAL_ROLES, type ClientToServerEvents, type ServerToClientEvents } from '@urbanfix/shared';
import { config } from '../config';
import { verifyAccessToken } from './auth';
import { logger } from './logger';
import { redis } from './redis';

type Events = ServerToClientEvents;
type EventName = keyof Events;
type EventArgs<E extends EventName> = Parameters<Events[E]>;

export const rooms = {
  user: (id: string) => `user:${id}`,
  issue: (id: string) => `issue:${id}`,
  ward: (id: string) => `ward:${id}`,
  officials: 'officials',
  publicMap: 'public-map',
};

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;
let emitter: Emitter<ServerToClientEvents> | null = null;

export function attachRealtime(server: HttpServer) {
  const pub = redis.duplicate();
  const sub = redis.duplicate();
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: config.WEB_ORIGIN, credentials: true },
    adapter: createAdapter(pub, sub),
    serveClient: false,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    socket.data.auth = token ? await verifyAccessToken(token) : null;
    next();
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as Awaited<ReturnType<typeof verifyAccessToken>>;
    if (auth) {
      void socket.join(rooms.user(auth.id));
      if (MUNICIPAL_ROLES.includes(auth.role)) {
        void socket.join(rooms.officials);
        if (auth.wardId) void socket.join(rooms.ward(auth.wardId));
      }
    }
    socket.on('issue:watch', (id) => {
      if (typeof id === 'string' && id.length <= 64) void socket.join(rooms.issue(id));
    });
    socket.on('issue:unwatch', (id) => {
      if (typeof id === 'string') void socket.leave(rooms.issue(id));
    });
    socket.on('map:watch', () => void socket.join(rooms.publicMap));
  });

  logger.debug('realtime attached');
  return io;
}

function target() {
  if (io) return io;
  if (config.JOBS_MODE === 'queue' && !config.isTest) {
    emitter ??= new Emitter(redis.duplicate());
    return emitter;
  }
  return null;
}

export function emitTo<E extends EventName>(room: string | string[], event: E, ...args: EventArgs<E>) {
  const t = target();
  if (!t) return;
  // Socket.IO's typed emit cannot express the generic spread; the call is checked by the signature above.
  (t.to(room) as unknown as { emit: (e: string, ...a: unknown[]) => void }).emit(event, ...args);
}

export async function closeRealtime() {
  if (io) {
    await io.close();
    io = null;
  }
}
