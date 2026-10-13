import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Inbox,
  Map as MapIcon,
  Rows3,
  Search,
  UserX,
  X,
  CircleCheck,
  Timer,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ISSUE_STATUSES,
  LABELS,
  PRIORITIES,
  type ManageIssueRow,
  type ManageStats,
  type MapPoint,
  type PagedResult,
} from '@urbanfix/shared';
import { IssueMarkers } from '../../components/map/IssueMarkers';
import { MapView, ViewWatcher, type ViewState } from '../../components/map/MapView';
import { WardLayer } from '../../components/map/WardLayer';
import { PriorityBadge, StatusPill } from '../../components/ui/Badge';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { Photo } from '../../components/ui/Photo';
import { CountUp, EmptyState, Segmented, Skeleton } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { hours, pct, timeAgo } from '../../lib/format';
import { useDebounced, useNow } from '../../lib/hooks';
import { qk } from '../../lib/query';
import { useCategories, useCategoryMap, useConfig, useWards } from '../../lib/reference';
import { toQuery, useDashFilters } from './filters';

function Kpis() {
  const { data } = useQuery({
    queryKey: qk.manageStats,
    queryFn: () => api<ManageStats>('/manage/stats'),
    refetchInterval: 60_000,
  });
  const tiles = [
    { label: 'Open', value: data?.open, Icon: Inbox, tone: '' },
    {
      label: 'Unassigned',
      value: data?.unassigned,
      Icon: UserX,
      tone: data?.unassigned ? 'text-[#7a5a00] dark:text-lane' : '',
    },
    { label: 'Past SLA', value: data?.overdue, Icon: AlarmClock, tone: data?.overdue ? 'text-cone-ink' : '' },
    { label: 'Resolved this week', value: data?.resolvedThisWeek, Icon: CircleCheck, tone: 'text-signal' },
    {
      label: 'Avg. time to resolve',
      value: data?.avgResolutionHours,
      Icon: Timer,
      tone: '',
      format: hours,
      sub: data ? `${pct(data.reopenRate)} reopened` : '',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <div className="flex items-center gap-2 text-muted">
            <t.Icon className="size-4" />
            <span className="text-xs font-semibold">{t.label}</span>
          </div>
          <div className={cn('mt-2 font-display text-3xl font-black tracking-tight', t.tone)}>
            {t.value == null ? (
              <Skeleton className="h-8 w-14" />
            ) : t.format ? (
              t.format(t.value)
            ) : (
              <CountUp value={t.value} />
            )}
          </div>
          {t.sub && <p className="text-xs text-muted">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function FilterBar() {
  const { filters, update, active, reset } = useDashFilters();
  const { data: categories } = useCategories();
  const { data: wards } = useWards();
  const user = useAuth((s) => s.user);
  const [q, setQ] = useState(filters.q);
  const dq = useDebounced(q, 350);
  useEffect(() => {
    if (dq !== filters.q) update({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const toggleStatus = (s: string) =>
    update({
      status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s],
    });

  return (
    <div className="card space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search issues</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, address or UF-000123"
            className="field pl-9"
          />
        </label>
        <select
          aria-label="Category"
          className="field w-auto"
          value={filters.category}
          onChange={(e) => update({ category: e.target.value })}
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          className="field w-auto"
          value={filters.priority}
          onChange={(e) => update({ priority: e.target.value })}
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {LABELS.priority[p]}
            </option>
          ))}
        </select>
        {(user?.role === 'ADMIN' || !user?.wardId) && (
          <select
            aria-label="Ward"
            className="field w-auto"
            value={filters.wardId}
            onChange={(e) => update({ wardId: e.target.value })}
          >
            <option value="">All wards</option>
            {wards?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Sort"
          className="field w-auto"
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value })}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
          <option value="priority">Highest priority</option>
          <option value="support">Most supported</option>
          <option value="sla">SLA due soonest</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ISSUE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            aria-pressed={filters.status.includes(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
              filters.status.includes(s) ? 'border-ink bg-ink text-bg' : 'border-line hover:bg-surface-2',
            )}
          >
            {LABELS.status[s]}
          </button>
        ))}
        <button
          onClick={() => update({ overdue: !filters.overdue })}
          aria-pressed={filters.overdue}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold',
            filters.overdue ? 'border-cone bg-cone text-white' : 'border-line hover:bg-surface-2',
          )}
        >
          <AlarmClock className="size-3.5" /> Past SLA
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          From{' '}
          <input
            type="date"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
            className="field w-auto px-2 py-1 text-xs"
          />
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          To{' '}
          <input
            type="date"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
            className="field w-auto px-2 py-1 text-xs"
          />
        </label>
        {active && (
          <button
            onClick={() => (setQ(''), reset())}
            className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function SlaCell({ row }: { row: ManageIssueRow }) {
  const now = useNow();
  if (!row.slaDueAt || !['PENDING', 'IN_PROGRESS', 'REOPENED'].includes(row.status))
    return <span className="text-muted">—</span>;
  const due = new Date(row.slaDueAt).getTime() - now;
  return (
    <span
      className={cn(
        'font-mono text-xs font-semibold',
        row.overdue ? 'text-cone-ink' : due < 12 * 3_600_000 ? 'text-[#7a5a00] dark:text-lane' : 'text-muted',
      )}
    >
      {row.overdue ? `${hours(-due / 3_600_000)} late` : `in ${hours(due / 3_600_000)}`}
    </span>
  );
}

function IssuesTable({
  data,
  loading,
  compact,
}: {
  data?: PagedResult<ManageIssueRow>;
  loading: boolean;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { filters, update } = useDashFilters();
  if (loading && !data) return <Skeleton className="h-96" />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<Inbox />}
        title="No issues match these filters"
        body="Try clearing a filter or widening the date range."
      />
    );
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cn('w-full text-sm', compact ? 'min-w-[40rem]' : 'min-w-[56rem]')}>
          <thead className="bg-surface-2 text-left">
            <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-display [&>th]:text-[0.7rem] [&>th]:font-extrabold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-muted">
              <th>Issue</th>
              <th>Status</th>
              <th>Priority</th>
              {!compact && <th>Ward</th>}
              <th>Assignee</th>
              <th className="text-right">Support</th>
              <th>SLA</th>
              {!compact && <th>Updated</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.items.map((r, i) => (
              <motion.tr
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 12) * 0.015 }}
                onClick={() => navigate(`/dashboard/issues/${r.id}`)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-surface-2 [&>td]:px-3 [&>td]:py-2.5',
                  r.overdue && 'bg-[#fff3ee] dark:bg-[#2a1810]',
                )}
              >
                <td>
                  <Link
                    to={`/dashboard/issues/${r.id}`}
                    className="flex items-center gap-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.coverPhoto ? (
                      <Photo
                        src={r.coverPhoto.thumbUrl}
                        thumbhash={r.coverPhoto.thumbhash}
                        alt=""
                        className="size-10 shrink-0 rounded-lg"
                      />
                    ) : (
                      <CategoryIcon category={r.category} size="md" />
                    )}
                    <span className="min-w-0">
                      <span className="block max-w-xs truncate font-semibold">{r.title}</span>
                      <span className="block font-mono text-[0.7rem] text-muted">
                        {r.ref} · {r.category.name}
                        {r.flagged && <span className="ml-1 rounded bg-cone px-1 text-white">flagged</span>}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>
                  <StatusPill status={r.status} />
                </td>
                <td>
                  <PriorityBadge priority={r.priority} />
                </td>
                {!compact && <td className="whitespace-nowrap text-muted">{r.wardName ?? '—'}</td>}
                <td className="whitespace-nowrap">
                  {r.assignee?.name ?? (
                    <span className="font-semibold text-[#7a5a00] dark:text-lane">Unassigned</span>
                  )}
                </td>
                <td className="text-right font-mono">{r.supportCount}</td>
                <td>
                  <SlaCell row={r} />
                </td>
                {!compact && (
                  <td className="whitespace-nowrap text-xs text-muted">{timeAgo(r.lastActivityAt)}</td>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm">
        <span className="text-muted">
          {(data.page - 1) * data.pageSize + 1}–{Math.min(data.total, data.page * data.pageSize)} of{' '}
          {data.total}
        </span>
        <div className="flex items-center gap-1">
          <button
            disabled={filters.page <= 1}
            onClick={() => update({ page: filters.page - 1 })}
            className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-mono text-xs">
            {data.page} / {pages}
          </span>
          <button
            disabled={filters.page >= pages}
            onClick={() => update({ page: filters.page + 1 })}
            className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function IssuesMap() {
  const { filters } = useDashFilters();
  const { data: config } = useConfig();
  const { data: wards } = useWards();
  const user = useAuth((s) => s.user);
  const catMap = useCategoryMap();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState | null>(null);
  // Ward officials see their own ward unless they pick another one.
  const scopedWard = filters.wardId || (user?.role !== 'ADMIN' ? (user?.wardId ?? '') : '');
  const params = { ...toQuery(filters), wardId: scopedWard || undefined, bbox: view?.bbox };
  const { data } = useQuery({
    queryKey: qk.map({ dash: true, ...params }),
    queryFn: () => api<{ points: MapPoint[] }>('/issues/map', { query: params }),
    enabled: Boolean(view),
    placeholderData: keepPreviousData,
  });
  const ward = wards?.find((w) => w.id === (filters.wardId || user?.wardId));
  const center: [number, number] = ward?.center
    ? [ward.center.lat, ward.center.lng]
    : config
      ? [config.city.center.lat, config.city.center.lng]
      : [18.52, 73.85];
  return (
    <MapView
      center={center}
      zoom={ward ? 14 : 12}
      className="h-[32rem] rounded-[var(--radius-card)] border border-line lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]"
    >
      <ViewWatcher onChange={setView} />
      {wards && <WardLayer wards={wards} highlightId={ward?.id} />}
      <IssueMarkers
        points={data?.points ?? []}
        categories={catMap}
        onSelect={(p) => navigate(`/dashboard/issues/${p.id}`)}
      />
    </MapView>
  );
}

export default function DashboardPage({ mode = 'all' }: { mode?: 'all' | 'assignments' }) {
  const { filters } = useDashFilters();
  const user = useAuth((s) => s.user);
  const [layout, setLayout] = useState<'split' | 'table' | 'map'>(() =>
    window.innerWidth >= 1280 ? 'split' : 'table',
  );
  const query = {
    ...toQuery(filters),
    sort: filters.sort,
    page: filters.page,
    pageSize: 25,
    overdue: filters.overdue ? 'true' : undefined,
    assignee: mode === 'assignments' ? 'me' : undefined,
  };
  const { data, isLoading } = useQuery({
    queryKey: qk.manage(query),
    queryFn: () => api<PagedResult<ManageIssueRow>>('/manage/issues', { query }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sign-label">{user?.wardId ? 'Your ward' : 'City-wide'}</p>
          <h1 className="text-3xl font-black">{mode === 'assignments' ? 'My assignments' : 'Issues'}</h1>
        </div>
        <Segmented
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            {
              value: 'table',
              label: (
                <span className="inline-flex items-center gap-1">
                  <Rows3 className="size-4" /> Table
                </span>
              ),
            },
            {
              value: 'split',
              label: (
                <span className="inline-flex items-center gap-1">
                  <Columns2 className="size-4" /> Split
                </span>
              ),
            },
            {
              value: 'map',
              label: (
                <span className="inline-flex items-center gap-1">
                  <MapIcon className="size-4" /> Map
                </span>
              ),
            },
          ]}
        />
      </div>
      {mode === 'all' && <Kpis />}
      <FilterBar />
      <div className={cn('grid gap-4', layout === 'split' && 'xl:grid-cols-[1.35fr_1fr]')}>
        {layout !== 'map' && <IssuesTable data={data} loading={isLoading} compact={layout === 'split'} />}
        {layout !== 'table' && <IssuesMap />}
      </div>
    </div>
  );
}
