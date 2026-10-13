import { createElement } from 'react';
import type { LucideProps } from 'lucide-react';
import { iconFor } from './icons';

/** Renders an icon chosen by name at runtime (category and badge icons come from data). */
export function DynamicIcon({ name, ...props }: { name: string | undefined } & LucideProps) {
  return createElement(iconFor(name), props);
}
