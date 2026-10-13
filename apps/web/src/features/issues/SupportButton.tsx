import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { IssueDetail } from '@urbanfix/shared';
import { api, ApiError } from '../../lib/api';
import { ensureSession } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { qk } from '../../lib/query';

/** "Me too" without a photo. Reporters are always supporters and can't un-support. */
export function SupportButton({ issue }: { issue: IssueDetail }) {
  const qc = useQueryClient();
  const [burst, setBurst] = useState(0);
  const active = issue.viewer.isSupporter;
  const locked = issue.viewer.isReporter;
  const m = useMutation({
    mutationFn: async (support: boolean) => {
      await ensureSession();
      return api<{ supportCount: number; isSupporter: boolean }>(`/issues/${issue.id}/support`, {
        method: support ? 'POST' : 'DELETE',
      });
    },
    onMutate: (support) => {
      if (support) setBurst((b) => b + 1);
      qc.setQueryData<IssueDetail>(qk.issue(issue.id), (old) =>
        old
          ? {
              ...old,
              supportCount: old.supportCount + (support ? 1 : -1),
              viewer: { ...old.viewer, isSupporter: support },
            }
          : old,
      );
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not update support');
      qc.invalidateQueries({ queryKey: qk.issue(issue.id) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.issue(issue.id) }),
  });
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      disabled={locked || m.isPending || issue.status === 'REJECTED'}
      onClick={() => m.mutate(!active)}
      aria-pressed={active}
      className={cn(
        'relative inline-flex h-12 items-center gap-2 rounded-2xl px-4 font-display font-extrabold transition-colors',
        active
          ? 'bg-signal text-white dark:text-[#06281d]'
          : 'border border-line bg-surface hover:bg-surface-2',
        locked && 'cursor-default',
      )}
      title={locked ? 'You reported this issue' : active ? 'Remove your support' : 'Support this issue'}
    >
      <span className="relative">
        <ThumbsUp className="size-5" />
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              className="pointer-events-none absolute inset-0"
              initial="a"
              animate="b"
              exit="c"
            >
              {Array.from({ length: 8 }, (_, i) => (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-lane"
                  variants={{
                    a: { x: 0, y: 0, opacity: 1 },
                    b: {
                      x: Math.cos((i / 8) * Math.PI * 2) * 22,
                      y: Math.sin((i / 8) * Math.PI * 2) * 22,
                      opacity: 0,
                      transition: { duration: 0.55 },
                    },
                  }}
                />
              ))}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <motion.span
        key={issue.supportCount}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="font-mono"
      >
        {issue.supportCount}
      </motion.span>
      <span className="text-sm">{locked ? 'You reported this' : active ? 'Supporting' : 'Me too'}</span>
    </motion.button>
  );
}
