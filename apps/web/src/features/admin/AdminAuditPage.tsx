import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AuditLogDTO, PagedResult } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { qk } from '../../lib/query';

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const params = { page, pageSize: 50, entityType: entity || undefined };
  const { data } = useQuery({
    queryKey: qk.admin('audit', params),
    queryFn: () => api<PagedResult<AuditLogDTO>>('/admin/audit-logs', { query: params }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sign-label">Administration</p>
          <h1 className="text-3xl font-black">Audit log</h1>
          <p className="text-sm text-muted">Every change made by officials and administrators.</p>
        </div>
        <select
          aria-label="Entity"
          className="field w-auto"
          value={entity}
          onChange={(e) => (setEntity(e.target.value), setPage(1))}
        >
          <option value="">Everything</option>
          {['issue', 'user', 'category', 'ward', 'report', 'settings'].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-surface-2 text-left text-[0.7rem] uppercase tracking-wider text-muted">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-display [&>th]:font-extrabold">
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((a) => (
                <tr key={a.id} className="[&>td]:px-3 [&>td]:py-2 align-top">
                  <td className="whitespace-nowrap font-mono text-xs">{dateTime(a.createdAt)}</td>
                  <td className="whitespace-nowrap">{a.actor?.name ?? 'System'}</td>
                  <td className="font-mono text-xs font-semibold">{a.action}</td>
                  <td
                    className="max-w-md truncate font-mono text-xs text-muted"
                    title={JSON.stringify(a.diff)}
                  >
                    {JSON.stringify(a.diff)}
                  </td>
                  <td className="font-mono text-xs text-muted">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-muted">
            <span>{data.total} entries</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Older
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
