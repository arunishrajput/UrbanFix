import { CircleCheck, Clock, Hammer, RotateCcw, ShieldCheck, Ban } from 'lucide-react';
import { LABELS, type IssueStatus, type Priority } from '@urbanfix/shared';
import { cn } from '../../lib/cn';

const STATUS_STYLE: Record<IssueStatus, { cls: string; Icon: typeof Clock }> = {
  PENDING: { cls: 'bg-[#fff4cc] text-[#7a5a00] dark:bg-[#3a3210] dark:text-[#f5d76e]', Icon: Clock },
  IN_PROGRESS: { cls: 'bg-[#e1eaff] text-[#1d43b0] dark:bg-[#1b2a4d] dark:text-[#9db7ff]', Icon: Hammer },
  RESOLVED: { cls: 'bg-signal-soft text-signal-strong', Icon: CircleCheck },
  VERIFIED: { cls: 'bg-signal text-white dark:text-[#06281d]', Icon: ShieldCheck },
  REOPENED: { cls: 'bg-[#ffe6da] text-cone-ink dark:bg-[#40210f]', Icon: RotateCcw },
  REJECTED: { cls: 'bg-surface-2 text-muted', Icon: Ban },
};

export function StatusPill({ status, className }: { status: IssueStatus; className?: string }) {
  const { cls, Icon } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
        cls,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {LABELS.status[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: 'text-muted border-line',
  MEDIUM: 'text-ink border-line',
  HIGH: 'text-cone-ink border-cone/40',
  CRITICAL: 'text-white bg-cone border-cone',
};

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 font-display text-[0.68rem] font-extrabold uppercase tracking-wider',
        PRIORITY_STYLE[priority],
        className,
      )}
    >
      {LABELS.priority[priority]}
    </span>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink',
        className,
      )}
    >
      {children}
    </span>
  );
}
