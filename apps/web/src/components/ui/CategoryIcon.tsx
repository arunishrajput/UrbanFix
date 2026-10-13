import type { CategoryRef } from '@urbanfix/shared';
import { cn } from '../../lib/cn';
import { DynamicIcon } from './DynamicIcon';

/** A category glyph on a rounded "road sign" plate in the category colour. */
export function CategoryIcon({
  category,
  size = 'md',
  className,
}: {
  category: Pick<CategoryRef, 'icon' | 'color' | 'name'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims = {
    sm: 'size-7 rounded-lg [&>svg]:size-4',
    md: 'size-10 rounded-xl [&>svg]:size-5',
    lg: 'size-14 rounded-2xl [&>svg]:size-7',
  }[size];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-white ring-2 ring-white/70 dark:ring-black/30',
        dims,
        className,
      )}
      style={{ backgroundColor: category.color }}
      title={category.name}
    >
      <DynamicIcon name={category.icon} aria-hidden strokeWidth={2.4} />
    </span>
  );
}
