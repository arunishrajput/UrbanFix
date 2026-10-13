import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Lock, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { MyReportRow, Paginated, ProfileDTO } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { iconFor } from '../../components/ui/icons';
import { CountUp, EmptyState, Skeleton } from '../../components/ui/misc';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { shortDate } from '../../lib/format';
import { qk } from '../../lib/query';
import { IssueRow } from '../issues/IssueCard';

/** Reputation ring: progress to the next level drawn as a lane marking. */
function LevelRing({ progress, label }: { progress: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--lane)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - progress) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
        <circle
          cx="60"
          cy="60"
          r={r - 12}
          fill="none"
          stroke="var(--line)"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="sign-label">Level</p>
          <p className="font-display text-lg font-black leading-tight">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ReportList({ type }: { type: 'submitted' | 'joined' | 'resolved' }) {
  const apiType = type === 'resolved' ? 'all' : type;
  const q = useInfiniteQuery({
    queryKey: qk.myReports(apiType),
    queryFn: ({ pageParam }) =>
      api<Paginated<MyReportRow>>('/me/reports', { query: { type: apiType, limit: 20, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  let items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (type === 'resolved')
    items = items.filter((i) => ['RESOLVED', 'VERIFIED', 'REOPENED'].includes(i.status));
  if (q.isLoading) return <Skeleton className="mt-4 h-40" />;
  if (!items.length) {
    return (
      <EmptyState
        title={
          type === 'resolved'
            ? 'Nothing resolved yet'
            : type === 'joined'
              ? 'You have not joined any issues'
              : 'No reports yet'
        }
        body={
          type === 'joined'
            ? 'When you report something a neighbour already reported, you join their issue.'
            : 'Spotted a problem? It takes about a minute.'
        }
        action={
          <Link to="/report" className="rounded-xl bg-lane px-4 py-2.5 font-display font-bold text-lane-ink">
            Report an issue
          </Link>
        }
      />
    );
  }
  return (
    <div className="mt-3">
      <div className="divide-y divide-line">
        {items.map((i) => (
          <IssueRow key={`${i.id}-${i.reportedAt}`} issue={i} />
        ))}
      </div>
      {q.hasNextPage && (
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => q.fetchNextPage()}
          loading={q.isFetchingNextPage}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('submitted');
  const { data: p } = useQuery({ queryKey: qk.profile, queryFn: () => api<ProfileDTO>('/me/profile') });

  if (!p) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const stats = [
    { label: 'Reports filed', value: p.stats.reportsCreated },
    { label: 'Issues joined', value: p.stats.reportsJoined },
    { label: 'Fixes verified', value: p.stats.verifications },
    { label: 'Reported & fixed', value: p.stats.resolvedCount },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {p.user.isGuest && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border-2 border-dashed border-lane p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <span className="font-bold">You are using a guest account on this device.</span> Create an account
            to keep your reports, badges and verification requests if you switch phones.
          </p>
          <Link
            to="/register"
            className="rounded-xl bg-lane px-4 py-2.5 text-center font-display font-bold text-lane-ink"
          >
            Save my reports
          </Link>
        </div>
      )}
      <section className="card flex flex-col items-center gap-6 p-6 sm:flex-row">
        <LevelRing progress={p.level.progress} label={p.level.name} />
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-3xl font-black">{p.user.isGuest ? 'Guest citizen' : p.user.name}</h1>
          <p className="text-sm text-muted">Member since {shortDate(p.user.createdAt)}</p>
          <p className="mt-3 font-display text-5xl font-black tracking-tight">
            <CountUp value={p.stats.reputation} />
            <span className="ml-2 align-middle font-sans text-sm font-semibold text-muted">reputation</span>
          </p>
          {p.level.next && (
            <p className="mt-1 text-xs text-muted">
              {p.level.next.min - p.stats.reputation} points to{' '}
              <span className="font-semibold text-ink">{p.level.next.name}</span>
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Contribution statistics">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="font-display text-3xl font-black">
              <CountUp value={s.value} />
            </p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-8" aria-labelledby="badges">
        <h2 id="badges" className="text-xl font-black">
          Badges
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {p.badges.map((b, i) => {
            const Icon = iconFor(b.icon);
            const earned = Boolean(b.earnedAt);
            return (
              <motion.li
                key={b.code}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 18 }}
                className={cn('card flex flex-col items-center p-4 text-center', !earned && 'opacity-70')}
                title={b.description}
              >
                <span
                  className={cn(
                    'relative grid size-14 place-items-center rounded-2xl',
                    earned ? 'bg-lane text-lane-ink' : 'bg-surface-2 text-muted',
                  )}
                >
                  <Icon className="size-7" />
                  {!earned && (
                    <Lock className="absolute -bottom-1 -right-1 size-5 rounded-full bg-surface p-0.5" />
                  )}
                </span>
                <p className="mt-2 font-display font-extrabold leading-tight">{b.name}</p>
                <p className="mt-0.5 text-[0.7rem] text-muted">{b.description}</p>
                {!earned && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-signal"
                      style={{ width: `${(b.progress.current / b.progress.target) * 100}%` }}
                    />
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
      </section>

      <section className="card mt-8 p-4 sm:p-6">
        <Tabs
          id="profile"
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'submitted', label: 'Submitted' },
            { value: 'joined', label: 'Joined' },
            { value: 'resolved', label: 'Resolution history' },
          ]}
        >
          <TabPanel value="submitted">
            <ReportList type="submitted" />
          </TabPanel>
          <TabPanel value="joined">
            <ReportList type="joined" />
          </TabPanel>
          <TabPanel value="resolved">
            <ReportList type="resolved" />
          </TabPanel>
        </Tabs>
      </section>
    </div>
  );
}
