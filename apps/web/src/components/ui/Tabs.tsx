import * as RT from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import { cn } from '../../lib/cn';

export function Tabs({
  value,
  onValueChange,
  tabs,
  children,
  className,
  id,
}: {
  value: string;
  onValueChange: (v: string) => void;
  tabs: { value: string; label: React.ReactNode }[];
  children: React.ReactNode;
  className?: string;
  id: string;
}) {
  return (
    <RT.Root value={value} onValueChange={onValueChange} className={className}>
      <RT.List className="relative flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <RT.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              'relative px-3 pb-3 pt-1 text-sm font-semibold transition-colors',
              value === t.value ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {t.label}
            {value === t.value && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-x-1 -bottom-px h-1 rounded-full bg-lane"
              />
            )}
          </RT.Trigger>
        ))}
      </RT.List>
      {children}
    </RT.Root>
  );
}

export const TabPanel = RT.Content;
