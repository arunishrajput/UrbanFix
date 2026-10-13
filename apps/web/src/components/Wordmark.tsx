import { Link } from 'react-router';
import { cn } from '../lib/cn';

export function Wordmark({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link
      to={to}
      className={cn('group inline-flex flex-col leading-none', className)}
      aria-label="UrbanFix home"
    >
      <span className="font-display text-[1.35rem] font-black tracking-[-0.03em]">
        Urban<span className="text-signal">Fix</span>
      </span>
      <span
        className="lane-line-h mt-1 h-[3px] w-full rounded-full transition-all group-hover:[--dash:8px]"
        aria-hidden
      />
    </Link>
  );
}
