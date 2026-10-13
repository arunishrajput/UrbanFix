import {
  CircleCheck,
  Flag,
  Hammer,
  ImagePlus,
  Lock,
  Megaphone,
  Merge,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Tag,
  TrendingUp,
  UserRoundCheck,
  Users,
  CircleX,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { LABELS, type IssueEventType, type TimelineEventDTO } from '@urbanfix/shared';
import { LaneLine } from '../../components/ui/LaneLine';
import { cn } from '../../lib/cn';
import { dateTime, timeAgo } from '../../lib/format';

const ICON: Record<IssueEventType, LucideIcon> = {
  CREATED: Flag,
  REPORT_JOINED: Users,
  STATUS_CHANGED: Hammer,
  ASSIGNED: UserRoundCheck,
  PRIORITY_CHANGED: TrendingUp,
  CATEGORY_CHANGED: Tag,
  NOTE_ADDED: Lock,
  WORK_PHOTOS_ADDED: ImagePlus,
  VERIFICATION_REQUESTED: Megaphone,
  VERIFICATION_RESPONSE: CircleCheck,
  REOPENED: RotateCcw,
  VERIFIED: ShieldCheck,
  MERGED: Merge,
  MODERATED: ShieldAlert,
};

function describe(e: TimelineEventDTO): { title: string; tone: 'default' | 'good' | 'bad' | 'internal' } {
  const who = e.actor?.name ?? 'System';
  const p = e.payload as Record<string, string | number | boolean | null>;
  switch (e.type) {
    case 'CREATED':
      return { title: `Reported by ${who}`, tone: 'default' };
    case 'REPORT_JOINED':
      return { title: `${who} reported it too`, tone: 'default' };
    case 'STATUS_CHANGED':
      return {
        title: `Marked ${LABELS.status[e.toStatus!].toLowerCase()}${e.actor ? ` by ${who}` : ''}`,
        tone: e.toStatus === 'RESOLVED' ? 'good' : e.toStatus === 'REJECTED' ? 'bad' : 'default',
      };
    case 'ASSIGNED':
      return {
        title: p.assigneeName ? `Assigned to ${p.assigneeName}` : 'Assignment removed',
        tone: 'default',
      };
    case 'PRIORITY_CHANGED':
      return {
        title: `Priority ${p.automatic ? 'raised automatically' : 'set'} to ${LABELS.priority[p.to as keyof typeof LABELS.priority].toLowerCase()}`,
        tone: 'default',
      };
    case 'CATEGORY_CHANGED':
      return { title: `Category changed to ${p.toName ?? p.to}`, tone: 'default' };
    case 'NOTE_ADDED':
      return { title: `Internal note by ${who}`, tone: 'internal' };
    case 'WORK_PHOTOS_ADDED':
      return { title: `${who} added work-completion photos`, tone: 'good' };
    case 'VERIFICATION_REQUESTED':
      return {
        title: `Asked ${p.eligible ?? 'the'} reporter${p.eligible === 1 ? '' : 's'} to confirm the fix`,
        tone: 'default',
      };
    case 'VERIFICATION_RESPONSE':
      return p.response === 'NOT_FIXED'
        ? { title: `${who} says it is still not fixed`, tone: 'bad' }
        : { title: `${who} confirmed it is fixed`, tone: 'good' };
    case 'REOPENED':
      return {
        title: p.by === 'citizen' ? 'Reopened after a citizen report' : `Reopened by ${who}`,
        tone: 'bad',
      };
    case 'VERIFIED':
      return { title: 'Fix verified by citizens', tone: 'good' };
    case 'MERGED':
      return { title: e.body ?? 'Merged', tone: 'default' };
    case 'MODERATED':
      return { title: `Moderation: report ${String(p.action).toLowerCase()}d`, tone: 'internal' };
  }
}

export function Timeline({ events }: { events: TimelineEventDTO[] }) {
  const ordered = [...events].reverse();
  return (
    <ol className="relative">
      {ordered.map((e, i) => {
        const { title, tone } = describe(e);
        const Icon =
          e.type === 'VERIFICATION_RESPONSE' && (e.payload as { response?: string }).response === 'NOT_FIXED'
            ? CircleX
            : ICON[e.type];
        const last = i === ordered.length - 1;
        return (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-20px' }}
            transition={{ delay: Math.min(i, 8) * 0.04 }}
            className="relative flex gap-4 pb-6"
          >
            {!last && (
              <LaneLine
                className="absolute bottom-0 left-[1.1rem] top-10"
                state={tone === 'bad' ? 'reopened' : 'idle'}
              />
            )}
            <span
              className={cn(
                'z-10 grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-surface',
                tone === 'good' && 'bg-signal text-white dark:text-[#06281d]',
                tone === 'bad' && 'bg-cone text-white',
                tone === 'internal' && 'bg-asphalt text-lane',
                tone === 'default' && 'bg-surface-2 text-ink',
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="font-semibold leading-snug">{title}</p>
              {e.body && e.type !== 'MERGED' && (
                <p
                  className={cn(
                    'mt-1 rounded-xl px-3 py-2 text-sm',
                    tone === 'internal' ? 'bg-[#fff8db] dark:bg-[#2c2610]' : 'bg-surface-2',
                  )}
                >
                  {e.body}
                </p>
              )}
              <p className="mt-1 font-mono text-[0.7rem] text-muted" title={dateTime(e.createdAt)}>
                {timeAgo(e.createdAt)}
                {e.isInternal && ' · visible to staff only'}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
