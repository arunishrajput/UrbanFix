import { Check, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { LABELS, STATUS_STEPS, statusStepIndex, type IssueStatus } from '@urbanfix/shared';
import { cn } from '../../lib/cn';
import { LaneLine } from './LaneLine';

/**
 * Reported → In progress → Resolved → Verified, joined by lane markings.
 * Completed stretches are solid, the active stretch moves, a reopened issue
 * shows the stretch back to "In progress" in cone orange.
 */
export function StatusStepper({ status }: { status: IssueStatus }) {
  const current = statusStepIndex(status);
  const rejected = status === 'REJECTED';
  const labels: Record<IssueStatus, string> = { ...LABELS.status, PENDING: 'Reported' };
  return (
    <ol className="flex items-start" aria-label={`Status: ${LABELS.status[status]}`}>
      {STATUS_STEPS.map((step, i) => {
        const done = !rejected && (i < current || (i === current && step === 'VERIFIED'));
        const active = !rejected && i === current && step !== 'VERIFIED';
        const reopenedHere = status === 'REOPENED' && i === 1;
        return (
          <li
            key={step}
            className="flex flex-1 flex-col items-center last:flex-none"
            aria-current={active ? 'step' : undefined}
          >
            <div className="flex w-full items-center">
              <motion.span
                initial={false}
                animate={{ scale: active ? 1.08 : 1 }}
                className={cn(
                  'z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 font-mono text-xs font-bold',
                  done && 'border-signal bg-signal text-white dark:text-[#06281d]',
                  active && !reopenedHere && 'border-lane bg-lane text-lane-ink',
                  reopenedHere && 'border-cone bg-cone text-white',
                  !done && !active && 'border-line bg-surface text-muted',
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : reopenedHere ? (
                  <RotateCcw className="size-4" />
                ) : (
                  i + 1
                )}
              </motion.span>
              {i < STATUS_STEPS.length - 1 && (
                <LaneLine
                  orientation="horizontal"
                  className="mx-1 flex-1"
                  state={
                    rejected
                      ? 'muted'
                      : i < current
                        ? 'done'
                        : i === current
                          ? status === 'REOPENED'
                            ? 'reopened'
                            : 'moving'
                          : 'idle'
                  }
                />
              )}
            </div>
            <span
              className={cn(
                'mt-2 self-start text-[0.7rem] font-semibold sm:text-xs',
                i === current ? 'text-ink' : 'text-muted',
                i === STATUS_STEPS.length - 1 && 'self-end text-right',
              )}
            >
              {reopenedHere ? 'Reopened' : labels[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
