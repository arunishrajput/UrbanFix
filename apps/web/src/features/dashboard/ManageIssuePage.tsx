import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  ExternalLink,
  Lock,
  LockOpen,
  Merge,
  ShieldAlert,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Marker } from 'react-leaflet';
import { toast } from 'sonner';
import {
  LABELS,
  PRIORITIES,
  type IssueStatus,
  type ManageIssueDetail,
  type ManageIssueRow,
  type PagedResult,
  type Priority,
  type StaffMember,
  type TimelineEventDTO,
} from '@urbanfix/shared';
import { MapView } from '../../components/map/MapView';
import { issueIcon } from '../../components/map/markers';
import { BeforeAfter } from '../../components/ui/BeforeAfter';
import { PriorityBadge, StatusPill } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { Textarea } from '../../components/ui/Field';
import { Lightbox } from '../../components/ui/Lightbox';
import { Photo } from '../../components/ui/Photo';
import { Sheet } from '../../components/ui/Sheet';
import { StatusStepper } from '../../components/ui/StatusStepper';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { EmptyState, Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { isTriage, useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { coords, dateTime, hours, timeAgo } from '../../lib/format';
import { qk } from '../../lib/query';
import { useWatchIssue } from '../../lib/realtime';
import { useNow } from '../../lib/hooks';
import { useCategories, useConfig } from '../../lib/reference';
import { Timeline } from '../issues/Timeline';
import { uploadPhoto } from '../report/uploads';

const TRANSITION_LABEL: Partial<Record<IssueStatus, string>> = {
  IN_PROGRESS: 'Start work',
  RESOLVED: 'Mark resolved',
  REJECTED: 'Reject',
  PENDING: 'Move back to pending',
  REOPENED: 'Reopen',
  VERIFIED: 'Verify now',
};

function useIssueMutation<T>(issueId: string, fn: (vars: T) => Promise<ManageIssueDetail>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.setQueryData(qk.manageIssue(issueId), data);
      qc.invalidateQueries({ queryKey: ['manage', 'issues'] });
      qc.invalidateQueries({ queryKey: qk.issueTimeline(issueId) });
      qc.invalidateQueries({ queryKey: qk.manageStats });
      if (success) toast.success(success);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });
}

function StatusActions({ issue }: { issue: ManageIssueDetail }) {
  const [target, setTarget] = useState<IssueStatus | null>(null);
  const [note, setNote] = useState('');
  const { data: config } = useConfig();
  const change = useIssueMutation(issue.id, (v: { status: IssueStatus; note?: string }) =>
    api<ManageIssueDetail>(`/manage/issues/${issue.id}/status`, { body: v }),
  );
  const needsPhoto =
    target === 'RESOLVED' && config?.verification.requireCompletionPhoto && issue.workPhotos.length === 0;
  const waiting = issue.status === 'RESOLVED' && (
    <p className="mb-2 rounded-xl bg-signal-soft px-3 py-2 text-sm font-medium text-signal-strong">
      Waiting for citizens to verify the fix.
    </p>
  );
  if (!issue.allowedTransitions.length) {
    return waiting || <p className="text-sm text-muted">No status changes available to you.</p>;
  }
  return (
    <>
      {waiting}
      <div className="flex flex-wrap gap-2">
        {issue.allowedTransitions.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={
              s === 'RESOLVED'
                ? 'primary'
                : s === 'REJECTED'
                  ? 'outline'
                  : s === 'IN_PROGRESS'
                    ? 'lane'
                    : 'outline'
            }
            onClick={() => {
              setNote('');
              setTarget(s);
            }}
          >
            {TRANSITION_LABEL[s] ?? LABELS.status[s]}
          </Button>
        ))}
      </div>
      <Sheet
        open={target != null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `${TRANSITION_LABEL[target] ?? LABELS.status[target]}?` : ''}
        description={
          target === 'RESOLVED'
            ? `Every citizen who reported this will be asked to confirm the fix within ${config?.verification.windowHours ?? 72} hours.`
            : target === 'REJECTED'
              ? 'Citizens will see your reason on the issue page.'
              : 'Supporters will be notified of the change.'
        }
      >
        {needsPhoto ? (
          <p className="rounded-xl bg-[#fff8db] p-3 text-sm dark:bg-[#2c2610]">
            Upload at least one work-completion photo first (in the panel on the right).
          </p>
        ) : (
          <>
            <Textarea
              label={target === 'REJECTED' ? 'Reason (required)' : 'Note for citizens (optional)'}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
            <Button
              className="mt-4 w-full"
              size="lg"
              variant={target === 'REJECTED' ? 'danger' : 'primary'}
              disabled={target === 'REJECTED' && !note.trim()}
              loading={change.isPending}
              onClick={() =>
                change.mutate(
                  { status: target!, note: note.trim() || undefined },
                  { onSuccess: () => setTarget(null) },
                )
              }
            >
              Confirm
            </Button>
          </>
        )}
      </Sheet>
    </>
  );
}

function AssignControl({ issue }: { issue: ManageIssueDetail }) {
  const { data: staff } = useQuery({
    queryKey: qk.staff(issue.ward?.id),
    queryFn: () => api<StaffMember[]>('/manage/staff', { query: { wardId: issue.ward?.id } }),
  });
  const assign = useIssueMutation(
    issue.id,
    (assigneeId: string | null) =>
      api<ManageIssueDetail>(`/manage/issues/${issue.id}/assign`, { body: { assigneeId } }),
    'Assignment updated',
  );
  return (
    <select
      aria-label="Assign to"
      className="field"
      value={issue.assignee?.id ?? ''}
      disabled={assign.isPending}
      onChange={(e) => assign.mutate(e.target.value || null)}
    >
      <option value="">Unassigned</option>
      {staff?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} — {LABELS.role[s.role]}
          {s.wardName ? `, ${s.wardName}` : ''} ({s.openAssignments} open)
        </option>
      ))}
    </select>
  );
}

function TriageControls({ issue }: { issue: ManageIssueDetail }) {
  const { data: categories } = useCategories();
  const patch = useIssueMutation(
    issue.id,
    (body: { priority?: Priority; priorityLocked?: boolean; categorySlug?: string }) =>
      api<ManageIssueDetail>(`/manage/issues/${issue.id}`, { method: 'PATCH', body }),
  );
  const isLocked = issue.priorityLocked;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="block text-xs font-semibold text-muted">Priority</span>
        <div className="flex gap-2">
          <select
            className="field"
            value={issue.priority}
            onChange={(e) => patch.mutate({ priority: e.target.value as Priority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {LABELS.priority[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={
              isLocked
                ? 'Priority is locked; automatic adjustments are off'
                : 'Lock to stop automatic adjustments'
            }
            aria-label={isLocked ? 'Unlock priority' : 'Lock priority'}
            onClick={() => patch.mutate({ priorityLocked: !isLocked })}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line hover:bg-surface-2"
          >
            {isLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          </button>
        </div>
      </label>
      <label className="space-y-1.5">
        <span className="block text-xs font-semibold text-muted">Category</span>
        <select
          className="field"
          value={issue.category.slug}
          onChange={(e) => patch.mutate({ categorySlug: e.target.value })}
        >
          {categories?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function WorkPhotos({ issue }: { issue: ManageIssueDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const add = useIssueMutation(
    issue.id,
    (uploadIds: string[]) =>
      api<ManageIssueDetail>(`/manage/issues/${issue.id}/work-photos`, { body: { uploadIds } }),
    'Work photos added',
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {issue.workPhotos.map((p) => (
          <Photo
            key={p.id}
            src={p.thumbUrl}
            thumbhash={p.thumbhash}
            alt="Work completion"
            className="size-20 rounded-xl"
          />
        ))}
        <button
          onClick={() => input.current?.click()}
          disabled={busy || add.isPending || !issue.allowedTransitions.length}
          className="grid size-20 place-items-center rounded-xl border-2 border-dashed border-line text-muted hover:border-signal hover:text-signal disabled:opacity-40"
          aria-label="Upload work-completion photo"
        >
          <Camera className={cn('size-6', (busy || add.isPending) && 'animate-pulse')} />
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []).slice(0, 6);
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          try {
            const ups = await Promise.all(files.map((f) => uploadPhoto(f, 'WORK_COMPLETION')));
            add.mutate(ups.map((u) => u.id));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Upload failed');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function Notes({ issueId }: { issueId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const { data } = useQuery({
    queryKey: qk.notes(issueId),
    queryFn: () =>
      api<{ items: { id: string; body: string; author: { name: string } | null; createdAt: string }[] }>(
        `/manage/issues/${issueId}/notes`,
      ),
  });
  const add = useMutation({
    mutationFn: () => api<{ items: unknown[] }>(`/manage/issues/${issueId}/notes`, { body: { body } }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: qk.notes(issueId) });
      qc.invalidateQueries({ queryKey: qk.issueTimeline(issueId) });
    },
  });
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
        className="flex gap-2"
      >
        <label className="flex-1">
          <span className="sr-only">Internal note</span>
          <input
            className="field"
            placeholder="Add an internal note (staff only)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
          />
        </label>
        <Button type="submit" loading={add.isPending} disabled={!body.trim()}>
          Add
        </Button>
      </form>
      <ul className="mt-3 space-y-2">
        {data?.items.map((n) => (
          <li key={n.id} className="rounded-xl bg-[#fff8db] p-3 text-sm dark:bg-[#2c2610]">
            <p>{n.body}</p>
            <p className="mt-1 font-mono text-[0.7rem] text-muted">
              {n.author?.name ?? 'Unknown'} · {timeAgo(n.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MergeSheet({
  issue,
  open,
  onOpenChange,
}: {
  issue: ManageIssueDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: qk.manage({ merge: q }),
    queryFn: () =>
      api<PagedResult<ManageIssueRow>>('/manage/issues', {
        query: { q, pageSize: 8, status: 'PENDING,IN_PROGRESS,REOPENED,RESOLVED' },
      }),
    enabled: q.trim().length >= 2,
  });
  const merge = useIssueMutation(
    issue.id,
    (targetIssueId: string) =>
      api<ManageIssueDetail>(`/manage/issues/${issue.id}/merge`, { body: { targetIssueId } }),
    'Issues merged',
  );
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Merge into another issue"
      description="Reports, photos and supporters move to the issue you pick. This one closes as a duplicate."
    >
      <input
        className="field"
        placeholder="Search by UF number or title"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <ul className="mt-3 space-y-2">
        {data?.items
          .filter((r) => r.id !== issue.id)
          .map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <CategoryIcon category={r.category} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.title}</span>
                <span className="font-mono text-xs text-muted">{r.ref}</span>
              </span>
              <Button
                size="sm"
                loading={merge.isPending && merge.variables === r.id}
                onClick={() =>
                  merge.mutate(r.id, {
                    onSuccess: (d) => {
                      onOpenChange(false);
                      navigate(`/dashboard/issues/${d.id}`);
                    },
                  })
                }
              >
                Merge here
              </Button>
            </li>
          ))}
      </ul>
    </Sheet>
  );
}

export default function ManageIssuePage() {
  const { id = '' } = useParams();
  const user = useAuth((s) => s.user);
  const triage = isTriage(user);
  const now = useNow();
  useWatchIssue(id);
  const [tab, setTab] = useState('timeline');
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const { data: issue, error } = useQuery({
    queryKey: qk.manageIssue(id),
    queryFn: () => api<ManageIssueDetail>(`/manage/issues/${id}`),
  });
  const { data: timeline } = useQuery({
    queryKey: qk.issueTimeline(id),
    queryFn: () => api<{ items: TimelineEventDTO[] }>(`/issues/${id}/timeline`),
    enabled: Boolean(issue),
  });

  if (error)
    return (
      <EmptyState title="Issue not available" body={error instanceof ApiError ? error.message : undefined} />
    );
  if (!issue) return <Skeleton className="h-[70vh]" />;

  const photos = [...issue.photos, ...issue.workPhotos];
  const overdue =
    issue.slaDueAt &&
    new Date(issue.slaDueAt).getTime() < now &&
    ['PENDING', 'IN_PROGRESS', 'REOPENED'].includes(issue.status);

  return (
    <div>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> All issues
      </Link>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <CategoryIcon category={issue.category} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-muted">
            {issue.ref} · {issue.ward ? `${issue.ward.code} ${issue.ward.name}` : 'No ward'} · reported{' '}
            {timeAgo(issue.createdAt)}
          </p>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">{issue.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={issue.status} />
            <PriorityBadge priority={issue.priority} />
            {issue.severity && (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold">
                <Sparkles className="size-3.5 text-[#a37f00]" /> Severity {issue.severity}/5
              </span>
            )}
            {overdue && (
              <span className="rounded-md bg-cone px-2 py-0.5 text-xs font-bold text-white">Past SLA</span>
            )}
            <span className="text-xs text-muted">
              {issue.supportCount} supporting · {issue.reporterCount} reporters
            </span>
          </div>
        </div>
        <Link
          to={`/issues/${issue.id}`}
          target="_blank"
          className="inline-flex items-center gap-1 text-sm font-semibold text-signal"
        >
          Public page <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {(issue.flaggedReports > 0 || issue.duplicateOverrides.length > 0) && (
        <div className="mt-4 space-y-2">
          {issue.flaggedReports > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-[#ffe6da] p-3 text-sm font-medium text-cone-ink dark:bg-[#40210f]">
              <ShieldAlert className="size-4" /> {issue.flaggedReports} report(s) flagged by automatic
              moderation. Photos are hidden from the public until an admin reviews them.
            </p>
          )}
          {issue.duplicateOverrides.map((o) => (
            <p key={o.reportId} className="rounded-xl bg-surface-2 p-3 text-sm">
              The citizen saw {o.dismissed.length} suggested duplicate(s) and filed this anyway:{' '}
              {o.dismissed.map((d) => (
                <Link
                  key={d.issueId}
                  to={`/dashboard/issues/${d.issueId}`}
                  className="font-semibold text-signal underline"
                >
                  match {Math.round(d.score * 100)}%
                </Link>
              ))}
              . Merge if it is the same problem.
            </p>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className="card p-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setLightbox(i)}
                  className="relative overflow-hidden rounded-xl"
                  aria-label="Open photo"
                >
                  <Photo src={p.thumbUrl} thumbhash={p.thumbhash} alt="" className="aspect-square" />
                  {p.kind !== 'REPORT' && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-white">
                      {p.kind === 'WORK_COMPLETION' ? 'Work' : 'Verification'}
                    </span>
                  )}
                  {p.status === 'HIDDEN' && (
                    <span className="absolute inset-0 grid place-items-center bg-black/60 text-xs font-bold text-white">
                      Hidden
                    </span>
                  )}
                </button>
              ))}
            </div>
            {issue.description && <p className="mt-4 text-[0.95rem]">{issue.description}</p>}
            <Lightbox photos={photos} index={lightbox} onClose={() => setLightbox(null)} />
          </section>
          {issue.workPhotos[0] && issue.photos[0] && (
            <BeforeAfter before={issue.photos[0]} after={issue.workPhotos[0]} />
          )}

          <section className="card p-4 sm:p-5">
            <Tabs
              id="manage"
              value={tab}
              onValueChange={setTab}
              tabs={[
                { value: 'timeline', label: 'Timeline' },
                { value: 'reports', label: `Reports (${issue.reports.length})` },
                { value: 'verification', label: 'Verification' },
              ]}
            >
              <TabPanel value="timeline" className="pt-4">
                {timeline ? <Timeline events={timeline.items} /> : <Skeleton className="h-40" />}
              </TabPanel>
              <TabPanel value="reports" className="pt-4">
                <ul className="space-y-3">
                  {issue.reports.map((r) => (
                    <li key={r.id} className="rounded-xl border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">
                          {r.reporter.displayName}{' '}
                          <span className="font-mono text-xs font-normal text-muted">
                            {r.reporterEmail ?? 'guest'}
                          </span>
                        </span>
                        <span className="text-xs text-muted">
                          {r.source.toLowerCase()} · {dateTime(r.createdAt)} · {r.distanceFromIssueM} m ·{' '}
                          {r.moderationStatus.toLowerCase()}
                        </span>
                      </div>
                      {r.description && <p className="mt-1 text-sm">{r.description}</p>}
                      <div className="mt-2 flex gap-2">
                        {r.photos.map((p) => (
                          <Photo
                            key={p.id}
                            src={p.thumbUrl}
                            thumbhash={p.thumbhash}
                            alt=""
                            className="size-14 rounded-lg"
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </TabPanel>
              <TabPanel value="verification" className="pt-4">
                {issue.verificationRounds.length ? (
                  <ul className="space-y-2">
                    {issue.verificationRounds.map((r) => (
                      <li key={r.id} className="rounded-xl border border-line p-3 text-sm">
                        <p className="font-semibold">
                          Round {r.roundNo} · {r.outcome.toLowerCase()}
                        </p>
                        <p className="font-mono text-xs text-muted">
                          ✓ {r.tally.resolved} · ✕ {r.tally.notFixed} · ↷ {r.tally.skipped} of{' '}
                          {r.eligibleCount} · opened {dateTime(r.openedAt)} · closes {dateTime(r.closesAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No resolution yet.</p>
                )}
              </TabPanel>
            </Tabs>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <section className="card p-4">
            <StatusStepper status={issue.status} />
          </section>
          <section className="card space-y-4 p-4">
            <div>
              <p className="sign-label mb-2">Status</p>
              <StatusActions issue={issue} />
            </div>
            {triage && (
              <div>
                <p className="sign-label mb-2">Assigned to</p>
                <AssignControl issue={issue} />
              </div>
            )}
            {!triage && issue.assignee && (
              <p className="text-sm">
                Assigned to <span className="font-semibold">{issue.assignee.name}</span>
              </p>
            )}
            {triage && <TriageControls issue={issue} />}
            <div>
              <p className="sign-label mb-2">Work-completion photos</p>
              <WorkPhotos issue={issue} />
            </div>
            {issue.slaDueAt && (
              <p className="text-xs text-muted">
                SLA target {dateTime(issue.slaDueAt)}{' '}
                {overdue ? `· ${hours((now - new Date(issue.slaDueAt).getTime()) / 3_600_000)} late` : ''}
              </p>
            )}
            {triage && issue.status !== 'REJECTED' && !issue.mergedIntoId && (
              <Button variant="ghost" size="sm" onClick={() => setMergeOpen(true)}>
                <Merge className="size-4" /> Merge duplicate into another issue
              </Button>
            )}
          </section>
          <section className="card p-4">
            <p className="sign-label mb-2 inline-flex items-center gap-1">
              <StickyNote className="size-3.5" /> Internal notes
            </p>
            <Notes issueId={issue.id} />
          </section>
          <section className="card overflow-hidden">
            <MapView center={[issue.lat, issue.lng]} zoom={16} className="h-52" scrollWheelZoom={false}>
              <Marker
                position={[issue.lat, issue.lng]}
                icon={issueIcon({
                  icon: issue.category.icon,
                  color: issue.category.color,
                  status: issue.status,
                })}
              />
            </MapView>
            <p className="p-3 text-sm">
              {issue.address}
              <span className="block font-mono text-xs text-muted">{coords(issue.lat, issue.lng)}</span>
            </p>
          </section>
        </aside>
      </div>
      <MergeSheet issue={issue} open={mergeOpen} onOpenChange={setMergeOpen} />
    </div>
  );
}
