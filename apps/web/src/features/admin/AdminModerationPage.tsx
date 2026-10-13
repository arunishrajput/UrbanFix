import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { ModerationItem, PagedResult } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { Photo } from '../../components/ui/Photo';
import { EmptyState, Segmented, Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { qk } from '../../lib/query';

type Status = 'FLAGGED' | 'PENDING' | 'REJECTED';

export default function AdminModerationPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('FLAGGED');
  const { data } = useQuery({
    queryKey: qk.admin('moderation', { status }),
    queryFn: () => api<PagedResult<ModerationItem>>('/admin/moderation', { query: { status, pageSize: 50 } }),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) =>
      api(`/admin/moderation/${id}/decision`, { body: { action } }),
    onSuccess: (_d, v) => {
      toast.success(
        v.action === 'APPROVE' ? 'Report approved and photos restored' : 'Report rejected and hidden',
      );
      qc.invalidateQueries({ queryKey: ['admin', 'moderation'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save the decision'),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sign-label">Administration</p>
          <h1 className="text-3xl font-black">Moderation</h1>
          <p className="text-sm text-muted">
            Reports flagged by automatic screening, or not yet screened because AI was unavailable.
          </p>
        </div>
        <Segmented
          label="Queue"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'FLAGGED', label: 'Flagged' },
            { value: 'PENDING', label: 'Unscreened' },
            { value: 'REJECTED', label: 'Rejected' },
          ]}
        />
      </div>
      {!data ? (
        <Skeleton className="h-96" />
      ) : !data.items.length ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Queue is clear"
          body="Nothing needs a decision right now."
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.items.map((m) => (
            <li key={m.reportId} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    to={`/dashboard/issues/${m.issueId}`}
                    className="font-display font-extrabold hover:text-signal"
                  >
                    {m.issueTitle}
                  </Link>
                  <p className="font-mono text-xs text-muted">
                    {m.issueRef} · {m.reporter.name} ({m.reporter.email ?? 'guest'}) · {timeAgo(m.createdAt)}
                  </p>
                </div>
              </div>
              {m.description && <p className="mt-2 text-sm">{m.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {m.photos.map((p) => (
                  <figure key={p.id} className="w-32">
                    <Photo
                      src={p.thumbUrl}
                      thumbhash={p.thumbhash}
                      alt=""
                      className="aspect-square rounded-xl"
                    />
                    <figcaption className="mt-1 text-[0.7rem] text-muted">
                      {p.flags.length ? p.flags.join(', ') : 'no flags'}
                      {p.reason && <span className="block">{p.reason}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {status !== 'REJECTED' && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => decide.mutate({ id: m.reportId, action: 'APPROVE' })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => decide.mutate({ id: m.reportId, action: 'REJECT' })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
