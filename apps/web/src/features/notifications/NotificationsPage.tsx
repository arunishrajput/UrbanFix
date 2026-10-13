import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCheck, Inbox } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { NotificationDTO, Paginated } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { EmptyState, Skeleton } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../lib/format';
import { qk } from '../../lib/query';
import { useConfig } from '../../lib/reference';
import { enablePush } from './push';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const [permission, setPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );
  const q = useInfiniteQuery({
    queryKey: qk.notifications,
    queryFn: ({ pageParam }) =>
      api<Paginated<NotificationDTO>>('/notifications', { query: { limit: 25, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const open = async (n: NotificationDTO) => {
    if (!n.readAt) {
      void api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() =>
        qc.invalidateQueries({ queryKey: qk.notifications }),
      );
    }
    if (n.type === 'VERIFICATION_REQUEST' && n.issueId) navigate(`/verify/${n.issueId}`);
    else if (n.issueId) navigate(`/issues/${n.issueId}`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-black">Notifications</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => readAll.mutate()}
          disabled={!items.some((n) => !n.readAt)}
        >
          <CheckCheck className="size-4" /> Mark all read
        </Button>
      </div>

      {permission === 'default' && (
        <div className="card mt-4 flex items-center gap-3 p-4">
          <BellRing className="size-6 shrink-0 text-signal" />
          <p className="flex-1 text-sm">
            Get notified on this device when your issues are updated or need your confirmation.
          </p>
          <Button
            size="sm"
            onClick={async () => {
              const result = await enablePush(config?.pushPublicKey ?? null);
              setPermission(result);
              if (result === 'granted') toast.success('Notifications turned on');
            }}
          >
            Turn on
          </Button>
        </div>
      )}

      <div className="mt-6">
        {q.isLoading && <Skeleton className="h-64" />}
        {!q.isLoading && !items.length && (
          <EmptyState
            icon={<Inbox />}
            title="No notifications yet"
            body="Updates on issues you report or support will show up here."
          />
        )}
        <ul className="space-y-2">
          {items.map((n, i) => (
            <motion.li
              key={n.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03 }}
            >
              <button
                onClick={() => open(n)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-surface-2',
                  n.readAt ? 'border-transparent' : 'border-line bg-surface shadow-sm',
                  n.type === 'VERIFICATION_REQUEST' && !n.readAt && 'border-lane',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 size-2.5 shrink-0 rounded-full',
                    n.readAt ? 'bg-transparent' : n.type === 'ISSUE_REOPENED' ? 'bg-cone' : 'bg-signal',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-bold">{n.title}</span>
                  <span className="block text-sm text-muted">{n.body}</span>
                  <span className="mt-1 block font-mono text-[0.7rem] text-muted">
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
                {n.type === 'VERIFICATION_REQUEST' && !n.readAt && (
                  <span className="shrink-0 rounded-lg bg-lane px-2.5 py-1 font-display text-xs font-extrabold text-lane-ink">
                    Verify
                  </span>
                )}
              </button>
            </motion.li>
          ))}
        </ul>
        {q.hasNextPage && (
          <Button
            variant="ghost"
            className="mt-4 w-full"
            onClick={() => q.fetchNextPage()}
            loading={q.isFetchingNextPage}
          >
            Load older
          </Button>
        )}
      </div>
    </div>
  );
}
