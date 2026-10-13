import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export const qk = {
  config: ['config'] as const,
  categories: ['categories'] as const,
  wards: ['wards'] as const,
  issue: (id: string) => ['issue', id] as const,
  issueTimeline: (id: string) => ['issue', id, 'timeline'] as const,
  issueReports: (id: string) => ['issue', id, 'reports'] as const,
  issues: (params: object) => ['issues', params] as const,
  nearby: (params: object) => ['issues', 'nearby', params] as const,
  map: (params: object) => ['issues', 'map', params] as const,
  heat: (params: object) => ['issues', 'heat', params] as const,
  upload: (id: string) => ['upload', id] as const,
  profile: ['me', 'profile'] as const,
  myReports: (type: string) => ['me', 'reports', type] as const,
  pendingVerifications: ['me', 'verifications'] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  manage: (params: object) => ['manage', 'issues', params] as const,
  manageIssue: (id: string) => ['manage', 'issue', id] as const,
  notes: (id: string) => ['manage', 'notes', id] as const,
  staff: (wardId?: string) => ['manage', 'staff', wardId ?? 'all'] as const,
  manageStats: ['manage', 'stats'] as const,
  analytics: (name: string, params: object) => ['analytics', name, params] as const,
  admin: (name: string, params?: object) => ['admin', name, params ?? {}] as const,
};
