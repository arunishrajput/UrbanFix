import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { PhotoAnalysis } from '@urbanfix/shared';
import { iconFor } from '../../../components/ui/icons';
import { Skeleton } from '../../../components/ui/misc';
import { cn } from '../../../lib/cn';
import { useCategories } from '../../../lib/reference';
import { useReportDraft } from '../store';

export function CategoryStep({
  suggestion,
  analysing,
}: {
  suggestion: PhotoAnalysis | null;
  analysing: boolean;
}) {
  const { data: categories } = useCategories();
  const { categorySlug, setCategory } = useReportDraft();
  const suggested = suggestion?.source === 'gemini' ? suggestion.categorySlug : null;

  return (
    <div>
      <h2 className="text-2xl font-black">What kind of problem is it?</h2>
      <p className="mt-1 text-sm text-muted">
        {suggested
          ? 'We picked one from your photo. Change it if it is wrong.'
          : analysing
            ? 'Analysing your photo to suggest a category…'
            : 'Pick the closest match. “Others” is fine if nothing fits.'}
      </p>
      <div
        className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Issue category"
      >
        {!categories && Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        {categories?.map((c, i) => {
          const Icon = iconFor(c.icon);
          const selected = categorySlug === c.slug;
          const isSuggested = suggested === c.slug;
          return (
            <motion.button
              key={c.slug}
              role="radio"
              aria-checked={selected}
              onClick={() => setCategory(c.slug, true)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025 }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                'relative flex min-h-24 flex-col items-start justify-between rounded-2xl border bg-surface p-3.5 text-left transition-colors',
                selected ? 'border-transparent' : 'border-line hover:border-muted/40',
              )}
            >
              {selected && (
                <motion.span
                  layoutId="cat-ring"
                  className="absolute inset-0 rounded-2xl ring-[3px]"
                  style={{ ['--tw-ring-color' as string]: c.color }}
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                />
              )}
              <span
                className="grid size-9 place-items-center rounded-xl text-white"
                style={{ backgroundColor: c.color }}
              >
                <Icon className="size-5" strokeWidth={2.4} />
              </span>
              <span className="mt-2 font-display text-[0.95rem] font-bold leading-tight">{c.name}</span>
              {isSuggested && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-lane px-2 py-0.5 text-[0.65rem] font-extrabold text-lane-ink">
                  <Sparkles className="size-3" /> {Math.round((suggestion?.confidence ?? 0) * 100)}%
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
