import { CircleCheck, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import type { IssueDetail } from '@urbanfix/shared';
import { StatusStepper } from '../../components/ui/StatusStepper';
import { CountUp } from '../../components/ui/misc';
import { dateTime } from '../../lib/format';

/** The complaint receipt shown after submitting (or joining) a report. */
export function Receipt({
  kind,
  issue,
  reopened,
  onAnother,
}: {
  kind: 'created' | 'joined';
  issue: IssueDetail;
  reopened?: boolean;
  onAnother: () => void;
}) {
  return (
    <div className="mx-auto max-w-md">
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 160 }}
        className="relative overflow-hidden rounded-[1.5rem] bg-surface shadow-[var(--shadow-float)]"
      >
        <div className="asphalt px-6 pb-6 pt-7 text-center">
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 400, damping: 14 }}
            className="mx-auto grid size-16 place-items-center rounded-full bg-lane text-lane-ink"
          >
            {kind === 'joined' ? <Users className="size-8" /> : <CircleCheck className="size-8" />}
          </motion.span>
          <h2 className="mt-4 text-2xl font-black">
            {kind === 'joined' ? (reopened ? 'Issue reopened' : 'You joined this issue') : 'Report received'}
          </h2>
          <p className="mt-1 text-sm text-white/70">
            {kind === 'joined'
              ? reopened
                ? 'It was marked resolved, but your report sends it straight back to the work list.'
                : 'Your photo is now evidence on the existing complaint.'
              : 'It is on its way to the municipal corporation.'}
          </p>
        </div>
        <div className="relative">
          <div className="absolute -left-3 -top-3 size-6 rounded-full bg-bg" aria-hidden />
          <div className="absolute -right-3 -top-3 size-6 rounded-full bg-bg" aria-hidden />
          <div className="mx-6 border-t-2 border-dashed border-line" aria-hidden />
        </div>
        <dl className="space-y-3 px-6 py-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Complaint number</dt>
            <dd className="font-mono text-base font-bold tracking-wider">{issue.ref}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Category</dt>
            <dd className="font-semibold">{issue.category.name}</dd>
          </div>
          {issue.address && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Location</dt>
              <dd className="text-right font-semibold">{issue.address}</dd>
            </div>
          )}
          {issue.ward && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Ward</dt>
              <dd className="font-semibold">{issue.ward.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{kind === 'joined' ? 'Citizens reporting' : 'Filed'}</dt>
            <dd className="font-mono font-semibold">
              {kind === 'joined' ? <CountUp value={issue.reporterCount} /> : dateTime(issue.createdAt)}
            </dd>
          </div>
        </dl>
        <div className="border-t border-line px-6 py-5">
          <StatusStepper status={issue.status} />
        </div>
      </motion.div>
      <p className="mt-5 text-center text-sm text-muted">
        We will notify you when it is assigned, resolved, and when we need you to confirm the fix.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link
          to={`/issues/${issue.id}`}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-signal font-display font-bold text-white dark:text-[#06281d]"
        >
          Track this issue
        </Link>
        <button
          onClick={onAnother}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-line font-display font-bold"
        >
          Report another
        </button>
      </div>
    </div>
  );
}
