import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  CircleCheck,
  Clock,
  MapPin,
  Share2,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Marker } from 'react-leaflet';
import { toast } from 'sonner';
import type { IssueDetail, ReportDTO, TimelineEventDTO } from '@urbanfix/shared';
import { LABELS } from '@urbanfix/shared';
import { MapView } from '../../components/map/MapView';
import { issueIcon } from '../../components/map/markers';
import { BeforeAfter } from '../../components/ui/BeforeAfter';
import { PriorityBadge, StatusPill } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { Lightbox } from '../../components/ui/Lightbox';
import { Photo } from '../../components/ui/Photo';
import { StatusStepper } from '../../components/ui/StatusStepper';
import { AvatarStack, EmptyState, Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { coords, dateTime, plural, shortDate, timeAgo } from '../../lib/format';
import { qk } from '../../lib/query';
import { useWatchIssue } from '../../lib/realtime';
import { JoinSheet } from './JoinSheet';
import { SupportButton } from './SupportButton';
import { Timeline } from './Timeline';

function Gallery({ issue }: { issue: IssueDetail }) {
  const [open, setOpen] = useState<number | null>(null);
  const all = [...issue.photos, ...issue.workPhotos];
  const [main, ...rest] = issue.photos;
  if (!main) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-[var(--radius-card)] bg-surface-2">
        <CategoryIcon category={issue.category} size="lg" />
      </div>
    );
  }
  return (
    <div>
      <button
        className="block w-full overflow-hidden rounded-[var(--radius-card)]"
        onClick={() => setOpen(0)}
        aria-label="Open photo"
      >
        <Photo
          src={main.url}
          thumbhash={main.thumbhash}
          alt={main.caption ?? issue.title}
          className="aspect-[4/3]"
          loading="eager"
        />
      </button>
      {rest.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {rest.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setOpen(i + 1)}
              className="shrink-0 overflow-hidden rounded-xl"
              aria-label={`Open photo ${i + 2}`}
            >
              <Photo src={p.thumbUrl} thumbhash={p.thumbhash} alt="" className="size-20" />
            </button>
          ))}
        </div>
      )}
      <Lightbox photos={all} index={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted [&>svg]:size-4">{icon}</span>
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  );
}

function Reports({ issueId }: { issueId: string }) {
  const { data } = useQuery({
    queryKey: qk.issueReports(issueId),
    queryFn: () => api<{ items: ReportDTO[] }>(`/issues/${issueId}/reports`),
  });
  if (!data) return <Skeleton className="h-32" />;
  return (
    <ul className="space-y-3">
      {data.items.map((r) => (
        <li key={r.id} className="flex gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-asphalt font-display text-xs font-extrabold text-lane">
            {r.reporter.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-bold">{r.reporter.isYou ? 'You' : r.reporter.displayName}</span>{' '}
              <span className="text-muted">
                {r.source === 'NEW'
                  ? 'reported it'
                  : r.source === 'MERGED'
                    ? 'reported it (merged)'
                    : 'added evidence'}{' '}
                · {timeAgo(r.createdAt)}
                {r.distanceFromIssueM > 0 && ` · ${r.distanceFromIssueM} m away`}
              </span>
            </p>
            {r.description && <p className="mt-1 text-sm">{r.description}</p>}
            {r.photos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {r.photos.map((p) => (
                  <Photo
                    key={p.id}
                    src={p.thumbUrl}
                    thumbhash={p.thumbhash}
                    alt=""
                    className="size-16 rounded-lg"
                  />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ResolutionHistory({ issue }: { issue: IssueDetail }) {
  if (!issue.verificationRounds.length)
    return (
      <p className="text-sm text-muted">
        Not resolved yet. Reporters will be asked to confirm once the crew marks it fixed.
      </p>
    );
  return (
    <ul className="space-y-3">
      {issue.verificationRounds.map((r) => (
        <li key={r.id} className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display font-extrabold">Resolution #{r.roundNo}</p>
            <span className="font-mono text-xs text-muted">{shortDate(r.openedAt)}</span>
          </div>
          <p className="mt-1 text-sm">
            {r.outcome === 'PENDING' &&
              `Waiting for citizens · closes ${timeAgo(r.closesAt).replace(' ago', '')} from opening`}
            {r.outcome === 'VERIFIED' && 'Confirmed fixed by citizens'}
            {r.outcome === 'REOPENED' && 'A citizen reported it was not fixed — reopened'}
            {r.outcome === 'EXPIRED' && 'No decision from citizens before the deadline'}
          </p>
          <div className="mt-2 flex gap-4 font-mono text-xs">
            <span className="text-signal">✓ {r.tally.resolved} fixed</span>
            <span className="text-cone-ink">✕ {r.tally.notFixed} not fixed</span>
            <span className="text-muted">↷ {r.tally.skipped} skipped</span>
            <span className="text-muted">of {r.eligibleCount}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function IssuePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  useWatchIssue(id);
  const [joinOpen, setJoinOpen] = useState(false);
  const {
    data: issue,
    error,
    isLoading,
  } = useQuery({ queryKey: qk.issue(id), queryFn: () => api<IssueDetail>(`/issues/${id}`) });
  const { data: timeline } = useQuery({
    queryKey: qk.issueTimeline(id),
    queryFn: () => api<{ items: TimelineEventDTO[] }>(`/issues/${id}/timeline`),
    enabled: Boolean(issue),
  });

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.2fr_1fr]">
        <Skeleton className="aspect-[4/3]" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }
  if (error || !issue) {
    return (
      <EmptyState
        title="Issue not found"
        body={error instanceof ApiError ? error.message : 'It may have been removed.'}
        action={
          <Link to="/map" className="font-bold text-signal">
            Browse the map
          </Link>
        }
      />
    );
  }

  const canJoin =
    ['PENDING', 'IN_PROGRESS', 'REOPENED', 'RESOLVED'].includes(issue.status) && !issue.viewer.isReporter;
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share)
        await navigator.share({ title: issue.title, text: `${issue.ref} on UrbanFix`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      {issue.mergedIntoId && (
        <Link
          to={`/issues/${issue.mergedIntoId}`}
          className="mt-4 block rounded-2xl bg-surface-2 p-4 text-sm font-semibold"
        >
          This report was merged into another issue as a duplicate. Follow updates there →
        </Link>
      )}

      {issue.viewer.pendingVerification && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          <Link
            to={`/verify/${issue.id}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-lane bg-[#fff8db] p-4 dark:bg-[#2c2610]"
          >
            <CircleCheck className="size-6 shrink-0 text-[#a37f00]" />
            <span className="flex-1">
              <span className="block font-display font-extrabold">The crew marked this fixed. Is it?</span>
              <span className="text-sm text-muted">
                Your answer decides whether it is verified or reopened.
              </span>
            </span>
            <span className="font-display font-bold text-signal">Verify</span>
          </Link>
        </motion.div>
      )}

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Gallery issue={issue} />
          {issue.workPhotos[0] && issue.photos[0] && (
            <section aria-labelledby="ba">
              <h2 id="ba" className="sign-label mb-2">
                Before and after
              </h2>
              <BeforeAfter before={issue.photos[0]} after={issue.workPhotos[0]} />
            </section>
          )}
          <section className="card p-5" aria-labelledby="tl">
            <h2 id="tl" className="text-lg font-black">
              Timeline
            </h2>
            <div className="mt-4">
              {timeline ? <Timeline events={timeline.items} /> : <Skeleton className="h-40" />}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryIcon category={issue.category} size="sm" />
              <span className="text-sm font-semibold">{issue.category.name}</span>
              <StatusPill status={issue.status} />
              <PriorityBadge priority={issue.priority} />
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-[2.1rem]">{issue.title}</h1>
            <p className="mt-1 font-mono text-xs text-muted">
              {issue.ref} · reported {timeAgo(issue.createdAt)}
            </p>
            {issue.description && <p className="mt-4 text-[1.02rem] leading-relaxed">{issue.description}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <SupportButton issue={issue} />
              {canJoin && (
                <Button variant="dark" size="lg" className="h-12" onClick={() => setJoinOpen(true)}>
                  <Camera className="size-4" /> Add my photo
                </Button>
              )}
              <Button variant="ghost" size="lg" className="h-12" onClick={share} aria-label="Share issue">
                <Share2 className="size-4" />
              </Button>
            </div>
          </section>

          <section className="card p-5">
            <StatusStepper status={issue.status} />
            {issue.status === 'REJECTED' && (
              <p className="mt-3 text-sm text-muted">
                The municipal corporation closed this issue. See the timeline for the reason.
              </p>
            )}
          </section>

          <section className="card overflow-hidden">
            <MapView
              center={[issue.lat, issue.lng]}
              zoom={16}
              className="h-48"
              scrollWheelZoom={false}
              label="Issue location"
            >
              <Marker
                position={[issue.lat, issue.lng]}
                icon={issueIcon({
                  icon: issue.category.icon,
                  color: issue.category.color,
                  status: issue.status,
                })}
              />
            </MapView>
            <dl className="grid gap-4 p-5 sm:grid-cols-2">
              <Fact icon={<MapPin />} label="Address">
                {issue.address ?? 'Not available'}
                <span className="block font-mono text-xs font-normal text-muted">
                  {coords(issue.lat, issue.lng)}
                </span>
              </Fact>
              <Fact icon={<ShieldCheck />} label="Ward">
                {issue.ward ? `${issue.ward.code} · ${issue.ward.name}` : '—'}
              </Fact>
              <Fact icon={<Users />} label="Citizens">
                <span className="flex items-center gap-2">
                  <AvatarStack initials={issue.reporterInitials} total={issue.reporterCount} />
                  <span className="text-sm">
                    {plural(issue.reporterCount, 'reporter')} · {issue.supportCount} supporting
                  </span>
                </span>
              </Fact>
              <Fact icon={<Clock />} label="Dates">
                <span className="block text-sm">Created {dateTime(issue.createdAt)}</span>
                <span className="block text-sm font-normal text-muted">
                  Updated {timeAgo(issue.updatedAt)}
                </span>
              </Fact>
              {issue.assignee && (
                <Fact icon={<UserRoundCheck />} label="Assigned to">
                  {issue.assignee.name}
                </Fact>
              )}
              <Fact icon={<Clock />} label="Reports attached">
                {plural(issue.reportCount, 'report')}
              </Fact>
            </dl>
          </section>

          <section className="card p-5" aria-labelledby="rep">
            <h2 id="rep" className="text-lg font-black">
              Reports from citizens
            </h2>
            <div className="mt-3">
              <Reports issueId={issue.id} />
            </div>
          </section>

          <section className="card p-5" aria-labelledby="res">
            <h2 id="res" className="text-lg font-black">
              Resolution history
            </h2>
            <p className="mb-3 text-xs text-muted">
              Status: <span className="font-semibold">{LABELS.status[issue.status]}</span>
              {issue.reopenedCount > 0 && ` · reopened ${plural(issue.reopenedCount, 'time')}`}
            </p>
            <ResolutionHistory issue={issue} />
          </section>
        </div>
      </div>
      <JoinSheet issue={issue} open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
