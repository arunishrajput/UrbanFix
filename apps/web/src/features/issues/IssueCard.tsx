import { ThumbsUp, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { formatDistance, type IssueSummary } from '@urbanfix/shared';
import { StatusPill } from '../../components/ui/Badge';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { Photo } from '../../components/ui/Photo';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../lib/format';

export function IssueCard({
  issue,
  className,
  compact,
}: {
  issue: IssueSummary;
  className?: string;
  compact?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }} className={className}>
      <Link
        to={`/issues/${issue.id}`}
        className="card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-float)]"
      >
        <div className="relative">
          {issue.coverPhoto ? (
            <Photo
              src={issue.coverPhoto.url}
              thumbhash={issue.coverPhoto.thumbhash}
              alt={issue.title}
              className={compact ? 'aspect-[16/10]' : 'aspect-[4/3]'}
            />
          ) : (
            <div
              className={cn(
                'grid place-items-center bg-surface-2',
                compact ? 'aspect-[16/10]' : 'aspect-[4/3]',
              )}
            >
              <CategoryIcon category={issue.category} size="lg" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            <CategoryIcon category={issue.category} size="sm" />
          </div>
          <StatusPill status={issue.status} className="absolute right-3 top-3 shadow-sm" />
          {issue.distanceM != null && (
            <span className="absolute bottom-3 left-3 rounded-md bg-black/65 px-2 py-0.5 font-mono text-xs font-semibold text-white">
              {formatDistance(issue.distanceM)}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="font-mono text-[0.7rem] text-muted">
            {issue.ref} · {timeAgo(issue.createdAt)}
          </p>
          <h3 className="mt-1 line-clamp-2 font-display text-[1.05rem] font-extrabold leading-snug group-hover:text-signal">
            {issue.title}
          </h3>
          {issue.address && <p className="mt-1 line-clamp-1 text-sm text-muted">{issue.address}</p>}
          <div className="mt-auto flex items-center gap-4 pt-3 text-xs font-semibold text-muted">
            <span className="inline-flex items-center gap-1" title="Citizens supporting">
              <ThumbsUp className="size-3.5" /> {issue.supportCount}
            </span>
            <span className="inline-flex items-center gap-1" title="Citizens who reported it">
              <Users className="size-3.5" /> {issue.reporterCount}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function IssueRow({ issue, right }: { issue: IssueSummary; right?: React.ReactNode }) {
  return (
    <Link
      to={`/issues/${issue.id}`}
      className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface-2"
    >
      {issue.coverPhoto ? (
        <Photo
          src={issue.coverPhoto.thumbUrl}
          thumbhash={issue.coverPhoto.thumbhash}
          alt=""
          className="size-14 shrink-0 rounded-xl"
        />
      ) : (
        <CategoryIcon category={issue.category} size="lg" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-bold">{issue.title}</p>
        <p className="truncate text-xs text-muted">
          <span className="font-mono">{issue.ref}</span> · {issue.category.name} ·{' '}
          {timeAgo(issue.lastActivityAt)}
        </p>
      </div>
      {right ?? <StatusPill status={issue.status} />}
    </Link>
  );
}
