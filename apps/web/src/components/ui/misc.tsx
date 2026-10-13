import { animate, useInView, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted [&>svg]:size-7">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-extrabold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Animates a number from 0 when it scrolls into view. */
export function CountUp({
  value,
  format = (n: number) => Math.round(n).toLocaleString(),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(() => format(0));
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(mv, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
  }, [inView, value, reduce, mv, format]);
  return <span ref={ref}>{reduce ? format(value) : display}</span>;
}

export function AvatarStack({
  initials,
  total,
  className,
}: {
  initials: string[];
  total: number;
  className?: string;
}) {
  const shown = initials.slice(0, 4);
  const palette = ['#0b6e4f', '#1d43b0', '#b43d0e', '#7a5a00', '#6d28d9'];
  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((ini, i) => (
        <span
          key={i}
          className="-ml-2 grid size-8 place-items-center rounded-full border-2 border-surface font-display text-[0.7rem] font-extrabold text-white first:ml-0"
          style={{ backgroundColor: palette[i % palette.length] }}
          aria-hidden
        >
          {ini}
        </span>
      ))}
      {total > shown.length && (
        <span className="-ml-2 grid h-8 min-w-8 place-items-center rounded-full border-2 border-surface bg-surface-2 px-1.5 font-mono text-[0.7rem] font-bold">
          +{total - shown.length}
        </span>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-xl bg-surface-2 p-1', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
