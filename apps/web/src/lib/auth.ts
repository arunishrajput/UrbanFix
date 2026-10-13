import { create } from 'zustand';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput, UpgradeGuestInput } from '@urbanfix/shared';
import { MUNICIPAL_ROLES } from '@urbanfix/shared';
import { api, onSessionChange, refreshSession, setAccessToken } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  user: AuthUser | null;
  token: string | null;
  bootstrap: () => Promise<void>;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  continueAsGuest: () => Promise<AuthUser>;
  upgrade: (input: UpgradeGuestInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

export const useAuth = create<AuthState>((set) => {
  const apply = (s: AuthResponse | null) => {
    setAccessToken(s?.accessToken ?? null);
    set(
      s
        ? { status: 'authenticated', user: s.user, token: s.accessToken }
        : { status: 'anonymous', user: null, token: null },
    );
    return s?.user ?? null;
  };
  onSessionChange(apply);

  return {
    status: 'loading',
    user: null,
    token: null,
    bootstrap: async () => {
      // Only try a silent refresh when the API said a session exists (avoids a 401 on every first visit).
      const hasSession = document.cookie.split('; ').some((c) => c === 'uf_session=1');
      apply(hasSession ? await refreshSession() : null);
    },
    login: async (input) => apply(await api<AuthResponse>('/auth/login', { body: input }))!,
    register: async (input) => apply(await api<AuthResponse>('/auth/register', { body: input }))!,
    continueAsGuest: async () => apply(await api<AuthResponse>('/auth/guest', { body: {} }))!,
    upgrade: async (input) => apply(await api<AuthResponse>('/auth/upgrade', { body: input }))!,
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      apply(null);
    },
    setUser: (user) => set({ user }),
  };
});

export const isMunicipal = (u: AuthUser | null) => Boolean(u && MUNICIPAL_ROLES.includes(u.role));
export const isTriage = (u: AuthUser | null) => u?.role === 'OFFICIAL' || u?.role === 'ADMIN';

/** Ensures a session exists (creating a guest one if needed) before a citizen action. */
export async function ensureSession(): Promise<AuthUser> {
  const s = useAuth.getState();
  if (s.user) return s.user;
  return s.continueAsGuest();
}
