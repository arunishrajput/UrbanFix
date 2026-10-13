import { useRef, useState } from 'react';
import type { PhotoDTO } from '@urbanfix/shared';

/** Drag (or use arrow keys) to compare the citizen's photo with the work-completion photo. */
export function BeforeAfter({ before, after }: { before: PhotoDTO; after: PhotoDTO }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const update = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };
  return (
    <div
      ref={ref}
      className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-2xl bg-surface-2"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && update(e.clientX)}
    >
      <img
        src={after.url}
        alt="After: work completed"
        className="absolute inset-0 size-full object-cover"
        draggable={false}
      />
      <img
        src={before.url}
        alt="Before: as reported"
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-display text-xs font-extrabold uppercase tracking-wider text-white">
        Before
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-signal px-2.5 py-1 font-display text-xs font-extrabold uppercase tracking-wider text-white">
        After
      </span>
      <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-lane" style={{ left: `${pos}%` }}>
        <button
          role="slider"
          aria-label="Compare before and after"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
            if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
          }}
          className="absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-lane bg-asphalt font-mono text-xs font-bold text-white shadow-lg"
        >
          ⇆
        </button>
      </div>
    </div>
  );
}
