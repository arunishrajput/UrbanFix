import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type {
  CreateIssueResult,
  DuplicateCandidateDTO,
  DuplicateCheckResult,
  JoinIssueResult,
  UploadDTO,
} from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { LaneLine } from '../../components/ui/LaneLine';
import { Photo } from '../../components/ui/Photo';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';
import { useCategoryMap } from '../../lib/reference';
import { DuplicateReview } from './DuplicateReview';
import { Receipt } from './Receipt';
import { STEPS, useReportDraft, type StepIndex } from './store';
import { CategoryStep } from './steps/CategoryStep';
import { DetailsStep } from './steps/DetailsStep';
import { LocationStep } from './steps/LocationStep';
import { PhotoStep } from './steps/PhotoStep';
import { bestSuggestion, useUploads } from './uploads';

function Progress({ step }: { step: StepIndex }) {
  return (
    <ol
      className="grid grid-cols-6 gap-1.5"
      aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
    >
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-col gap-1.5">
          <LaneLine
            orientation="horizontal"
            state={i < step ? 'done' : i === step ? 'moving' : 'muted'}
            className="h-1.5"
          />
          <span
            className={cn(
              'hidden text-[0.7rem] font-semibold sm:block',
              i === step ? 'text-ink' : 'text-muted',
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Review({ uploads }: { uploads: Map<string, UploadDTO | undefined> }) {
  const d = useReportDraft();
  const cat = useCategoryMap().get(d.categorySlug ?? '');
  return (
    <div>
      <h2 className="text-2xl font-black">Check and send</h2>
      <p className="mt-1 text-sm text-muted">
        {d.duplicates?.candidates.length
          ? 'You chose to file this as a new issue.'
          : 'No similar open issues were found nearby.'}
      </p>
      <div className="card mt-5 overflow-hidden">
        <div className="flex gap-2 overflow-x-auto p-3">
          {d.photos
            .filter((p) => p.uploadId)
            .map((p) => {
              const u = uploads.get(p.uploadId!);
              return u ? (
                <Photo
                  key={p.key}
                  src={u.thumbUrl}
                  thumbhash={u.thumbhash}
                  alt="Your photo"
                  className="size-24 shrink-0 rounded-xl"
                />
              ) : (
                <img
                  key={p.key}
                  src={p.previewUrl}
                  alt="Your photo"
                  className="size-24 shrink-0 rounded-xl object-cover"
                />
              );
            })}
        </div>
        <dl className="divide-y divide-line border-t border-line text-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-muted">Category</dt>
            <dd className="flex items-center gap-2 font-semibold">
              {cat && <CategoryIcon category={cat} size="sm" />} {cat?.name}
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted">Location</dt>
            <dd className="text-right font-semibold">
              {d.address ?? `${d.location?.lat.toFixed(5)}, ${d.location?.lng.toFixed(5)}`}
            </dd>
          </div>
          {d.description && (
            <div className="px-4 py-3">
              <dt className="text-muted">Description</dt>
              <dd className="mt-1">{d.description}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

export default function ReportPage() {
  const d = useReportDraft();
  const user = useAuth((s) => s.user);
  const uploadIds = d.photos.filter((p) => p.uploadId).map((p) => p.uploadId!);
  const uploadQueries = useUploads(uploadIds);
  const uploads = new Map(uploadIds.map((id, i) => [id, uploadQueries[i]?.data]));
  const uploadList = [...uploads.values()];
  const suggestion = bestSuggestion(uploadList);
  const analysing = uploadList.some((u) => u?.analysisStatus === 'PENDING');

  // Pre-select the AI's category until the citizen picks one themselves.
  const setCategory = useReportDraft((s) => s.setCategory);
  const suggestedSlug = suggestion?.source === 'gemini' ? suggestion.categorySlug : null;
  useEffect(() => {
    const { categoryChosenByUser, categorySlug } = useReportDraft.getState();
    if (suggestedSlug && !categoryChosenByUser && categorySlug !== suggestedSlug)
      setCategory(suggestedSlug, false);
  }, [suggestedSlug, setCategory]);

  // Leaving after a finished report starts fresh next time.
  useEffect(
    () => () => {
      if (useReportDraft.getState().result) useReportDraft.getState().reset();
    },
    [],
  );

  const position = d.location
    ? { lat: d.location.lat, lng: d.location.lng, accuracyM: d.location.accuracy ?? undefined }
    : null;

  const check = useMutation({
    mutationFn: () =>
      api<DuplicateCheckResult>('/issues/duplicates/check', {
        body: {
          ...position,
          categorySlug: d.categorySlug,
          description: d.description || undefined,
          uploadIds,
        },
      }),
    onSuccess: (res) => {
      d.setDuplicates(res);
      const fresh = res.candidates.filter((c) => !d.dismissed.includes(c.issue.id));
      d.setStep(fresh.length ? 4 : 5);
    },
    onError: () => {
      d.setDuplicates(null);
      d.setStep(5);
    },
  });

  const join = useMutation({
    mutationFn: (c: DuplicateCandidateDTO) =>
      api<JoinIssueResult>(`/issues/${c.issue.id}/join`, {
        body: { ...position, description: d.description || undefined, uploadIds },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      d.setResult({ kind: 'joined', issue: res.issue, reopened: res.reopened });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not join the issue'),
  });

  const submit = useMutation({
    mutationFn: () =>
      api<CreateIssueResult>('/issues', {
        body: {
          ...position,
          address: d.address ?? undefined,
          categorySlug: d.categorySlug,
          description: d.description || undefined,
          uploadIds,
          dismissedCandidateIds: d.dismissed,
        },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      d.setResult({ kind: 'created', issue: res.issue });
    },
    onError: (err) => {
      if (
        err instanceof ApiError &&
        (err.code === 'DUPLICATE_SUSPECTED' || err.code === 'ALREADY_REPORTED') &&
        err.details
      ) {
        d.setDuplicates(err.details as DuplicateCheckResult);
        d.setStep(4);
        toast.message('A matching issue was found just now', {
          description: 'Take a look before filing a new one.',
        });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Could not submit the report');
    },
  });

  if (d.result) {
    return (
      <div className="px-4 py-8">
        <Receipt
          kind={d.result.kind}
          issue={d.result.issue}
          reopened={d.result.reopened}
          onAnother={d.reset}
        />
      </div>
    );
  }

  const uploading = d.photos.some((p) => p.status === 'uploading');
  const canNext =
    (d.step === 0 && uploadIds.length > 0 && !uploading) ||
    (d.step === 1 && Boolean(d.location)) ||
    (d.step === 2 && Boolean(d.categorySlug)) ||
    d.step === 3;

  const next = () => {
    if (d.step === 3) return check.mutate();
    d.setStep((d.step + 1) as StepIndex);
  };
  const back = () =>
    d.setStep((d.step === 5 && !d.duplicates?.candidates.length ? 3 : d.step - 1) as StepIndex);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="sign-label">Report an issue</h1>
        {(!user || user.isGuest) && (
          <span className="text-xs text-muted">
            Reporting as guest ·{' '}
            <Link to="/login?next=/report" className="font-semibold text-signal">
              Sign in
            </Link>
          </span>
        )}
      </div>
      <div className="mt-3">
        <Progress step={d.step} />
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={d.step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
          className="mt-7"
        >
          {d.step === 0 && <PhotoStep uploads={uploads} />}
          {d.step === 1 && <LocationStep uploads={uploadList} />}
          {d.step === 2 && <CategoryStep suggestion={suggestion} analysing={analysing} />}
          {d.step === 3 && <DetailsStep suggestion={suggestion} />}
          {d.step === 4 && d.duplicates && position && (
            <DuplicateReview
              result={d.duplicates}
              origin={position}
              joiningId={join.isPending ? (join.variables?.issue.id ?? null) : null}
              onJoin={(c) => join.mutate(c)}
              onCreateNew={() => {
                d.dismiss(d.duplicates!.candidates.map((c) => c.issue.id));
                d.setStep(5);
              }}
            />
          )}
          {d.step === 5 && <Review uploads={uploads} />}
        </motion.section>
      </AnimatePresence>

      <div className="fixed inset-x-0 bottom-0 z-[800] border-t border-line bg-surface/95 pb-safe backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {d.step > 0 ? (
            <Button variant="ghost" onClick={back} aria-label="Previous step">
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : (
            <Link to="/" className="px-3 text-sm font-semibold text-muted">
              Cancel
            </Link>
          )}
          <div className="ml-auto">
            {d.step < 4 && (
              <Button size="lg" onClick={next} disabled={!canNext} loading={check.isPending}>
                {d.step === 3 ? (check.isPending ? 'Checking nearby' : 'Check & continue') : 'Continue'}
                <ArrowRight className="size-4" />
              </Button>
            )}
            {d.step === 5 && (
              <Button size="lg" variant="lane" onClick={() => submit.mutate()} loading={submit.isPending}>
                <Send className="size-4" /> Submit report
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
