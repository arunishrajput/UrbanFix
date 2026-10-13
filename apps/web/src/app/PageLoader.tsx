import { cn } from '../lib/cn';

/** Lane dashes driving past while a page loads. */
export function PageLoader({ full }: { full?: boolean }) {
  return (
    <div
      className={cn('grid place-items-center', full ? 'min-h-dvh' : 'min-h-[50vh]')}
      role="status"
      aria-label="Loading"
    >
      <span className="lane-line-h lane-moving block h-1.5 w-28 rounded-full" />
    </div>
  );
}
