import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CircleCheck, CircleX, LoaderCircle, SkipForward } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import type { IssueDetail, VerificationResponse } from '@urbanfix/shared';
import { BeforeAfter } from '../../components/ui/BeforeAfter';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Field';
import { Photo } from '../../components/ui/Photo';
import { StatusStepper } from '../../components/ui/StatusStepper';
import { EmptyState, Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../lib/format';
import { qk } from '../../lib/query';
import { uploadPhoto } from '../report/uploads';

type Outcome = {
  decision: 'REOPEN' | 'VERIFY' | 'WAIT' | 'EXPIRE';
  issue: IssueDetail;
  response: VerificationResponse;
};

const CHOICES = [
  {
    value: 'RESOLVED' as const,
    label: 'It’s fixed',
    sub: 'The problem is gone',
    Icon: CircleCheck,
    cls: 'bg-signal text-white dark:text-[#06281d]',
  },
  {
    value: 'NOT_FIXED' as const,
    label: 'Still not fixed',
    sub: 'Show us with a photo',
    Icon: CircleX,
    cls: 'bg-cone text-white',
  },
  {
    value: 'SKIPPED' as const,
    label: 'Skip',
    sub: 'I can’t check right now',
    Icon: SkipForward,
    cls: 'bg-surface-2 text-ink',
  },
];

export default function VerifyPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: issue, isLoading } = useQuery({
    queryKey: qk.issue(id),
    queryFn: () => api<IssueDetail>(`/issues/${id}`),
  });
  const [choice, setChoice] = useState<VerificationResponse | null>(null);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const respond = useMutation({
    mutationFn: (response: VerificationResponse) =>
      api<{ decision: Outcome['decision']; issue: IssueDetail }>(`/issues/${id}/verification`, {
        body: { response, comment: comment || undefined, uploadIds: photo ? [photo.id] : [] },
      }),
    onSuccess: (res, response) => {
      qc.setQueryData(qk.issue(id), res.issue);
      qc.invalidateQueries({ queryKey: qk.pendingVerifications });
      qc.invalidateQueries({ queryKey: qk.issueTimeline(id) });
      setOutcome({ ...res, response });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not send your answer'),
  });

  if (isLoading)
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-8">
        <Skeleton className="aspect-[4/3]" />
        <Skeleton className="h-40" />
      </div>
    );
  if (!issue) return <EmptyState title="Issue not found" />;

  if (outcome) {
    const reopened = outcome.decision === 'REOPEN';
    const verified = outcome.decision === 'VERIFY';
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <motion.span
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14 }}
          className={cn(
            'mx-auto grid size-20 place-items-center rounded-full',
            reopened ? 'bg-cone text-white' : 'bg-signal text-white',
          )}
        >
          {reopened ? <CircleX className="size-10" /> : <CircleCheck className="size-10" />}
        </motion.span>
        <h1 className="mt-5 text-3xl font-black">
          {reopened
            ? 'Reopened. Officials have been notified.'
            : verified
              ? 'Verified. Thank you!'
              : outcome.response === 'SKIPPED'
                ? 'Skipped'
                : 'Thanks for checking'}
        </h1>
        <p className="mt-2 text-muted">
          {reopened
            ? 'Your photo is attached as evidence and the issue is back on the work list with higher priority.'
            : verified
              ? 'Enough citizens confirmed the fix, so the issue is now closed as verified.'
              : outcome.response === 'SKIPPED'
                ? 'Other reporters can still confirm it.'
                : 'We are waiting for a few more reporters to confirm.'}
        </p>
        <div className="card mt-6 p-5 text-left">
          <StatusStepper status={outcome.issue.status} />
        </div>
        <Link
          to={`/issues/${id}`}
          className="mt-6 inline-flex h-12 items-center rounded-xl bg-signal px-6 font-display font-bold text-white dark:text-[#06281d]"
        >
          View the issue
        </Link>
      </div>
    );
  }

  const round = issue.viewer.pendingVerification;
  const before = issue.photos[0];
  const after = issue.workPhotos[0];

  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-6">
      <p className="sign-label">Confirm the fix</p>
      <h1 className="mt-1 text-3xl font-black leading-tight">{issue.title}</h1>
      <p className="mt-1 font-mono text-xs text-muted">
        {issue.ref} · {issue.address}
      </p>

      <div className="mt-5">
        {before && after ? (
          <BeforeAfter before={before} after={after} />
        ) : before ? (
          <Photo
            src={before.url}
            thumbhash={before.thumbhash}
            alt={issue.title}
            className="aspect-[4/3] rounded-2xl"
          />
        ) : null}
        {issue.resolvedAt && (
          <p className="mt-2 text-xs text-muted">
            Marked resolved {timeAgo(issue.resolvedAt)} by the municipal corporation.
          </p>
        )}
      </div>

      {!round ? (
        <div className="card mt-6 p-5">
          <p className="font-semibold">
            {issue.viewer.myVerification
              ? 'You already answered for this resolution.'
              : 'This issue is not waiting for your confirmation.'}
          </p>
          <Link to={`/issues/${id}`} className="mt-2 inline-block font-bold text-signal">
            View the issue
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mt-7 text-xl font-black">Did they fix it?</h2>
          <div className="mt-3 grid gap-3" role="radiogroup" aria-label="Your answer">
            {CHOICES.map(({ value, label, sub, Icon, cls }) => (
              <motion.button
                key={value}
                role="radio"
                aria-checked={choice === value}
                whileTap={{ scale: 0.98 }}
                onClick={() => setChoice(value)}
                className={cn(
                  'flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors',
                  choice === value ? 'border-ink' : 'border-line hover:border-muted/40',
                )}
              >
                <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', cls)}>
                  <Icon className="size-6" />
                </span>
                <span>
                  <span className="block font-display text-lg font-extrabold">{label}</span>
                  <span className="text-sm text-muted">{sub}</span>
                </span>
              </motion.button>
            ))}
          </div>

          <AnimatePresence>
            {choice === 'NOT_FIXED' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-4 pt-5">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setUploading(true);
                      try {
                        const u = await uploadPhoto(file, 'VERIFICATION');
                        setPhoto({ id: u.id, url: u.thumbUrl });
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : 'Upload failed');
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-cone/60 bg-surface-2 font-display font-bold text-muted"
                  >
                    {uploading ? (
                      <LoaderCircle className="size-6 animate-spin" />
                    ) : photo ? (
                      <img src={photo.url} alt="Your photo" className="size-full object-cover" />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Camera className="size-5" /> Photo of the problem today (required)
                      </span>
                    )}
                  </button>
                  <Textarea
                    label="What is still wrong? (optional)"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={1000}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {round && (
        <div className="fixed inset-x-0 bottom-0 z-[800] border-t border-line bg-surface/95 pb-safe backdrop-blur">
          <div className="mx-auto max-w-xl px-4 py-3">
            <Button
              size="lg"
              className="w-full"
              variant={choice === 'NOT_FIXED' ? 'danger' : 'primary'}
              disabled={!choice || (choice === 'NOT_FIXED' && !photo)}
              loading={respond.isPending}
              onClick={() => choice && respond.mutate(choice)}
            >
              {choice === 'NOT_FIXED'
                ? 'Reopen this issue'
                : choice === 'SKIPPED'
                  ? 'Skip for now'
                  : 'Confirm it’s fixed'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
