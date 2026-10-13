import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@urbanfix/shared';
import { API_BASE } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;
let currentToken: string | null | undefined;

/** One shared connection, re-authenticated whenever the access token changes. */
export function getSocket(token: string | null): AppSocket {
  if (socket && currentToken === token) return socket;
  socket?.disconnect();
  currentToken = token;
  socket = io(API_BASE || window.location.origin, {
    path: '/socket.io',
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

export function peekSocket() {
  return socket;
}
