import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { qk } from '../../lib/query';

export function useUnreadCount() {
  const user = useAuth((s) => s.user);
  return useQuery({
    queryKey: qk.unread,
    queryFn: () => api<{ count: number }>('/notifications/unread-count').then((r) => r.count),
    enabled: Boolean(user),
    refetchInterval: 120_000,
  });
}
