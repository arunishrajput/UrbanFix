import { cn } from '../../lib/cn';

/**
 * The lane marking: a dashed road line that represents an issue's journey.
 * Dashes move while work is in progress, turn solid once the issue is fixed,
 * and turn cone-orange when it was reopened.
 */
export function LaneLine({
  orientation = 'vertical',
  state = 'idle',
  className,
}: {
  orientation?: 'vertical' | 'horizontal';
  state?: 'idle' | 'moving' | 'done' | 'reopened' | 'muted';
  className?: string;
}) {
  const vertical = orientation === 'vertical';
  if (state === 'done' || state === 'muted') {
    return (
      <span
        aria-hidden
        className={cn(
          vertical ? 'w-1' : 'h-1',
          'block rounded-full',
          state === 'done' ? 'bg-signal' : 'bg-line',
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'block rounded-full',
        vertical ? 'lane-line w-1' : 'lane-line-h h-1',
        state === 'moving' && 'lane-moving',
        state === 'reopened' && '[--lane:var(--cone)]',
        className,
      )}
    />
  );
}
