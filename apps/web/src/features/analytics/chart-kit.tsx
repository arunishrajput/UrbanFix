import { useEffect, useState } from 'react';

const VARS = ['--series-1', '--series-2', '--grid', '--muted', '--ink', '--surface', '--line'] as const;
type ChartColors = Record<'s1' | 's2' | 'grid' | 'muted' | 'ink' | 'surface' | 'line', string>;

function read(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const [s1, s2, grid, muted, ink, surface, line] = VARS.map((n) =>
    cs.getPropertyValue(n).trim(),
  ) as string[];
  return { s1: s1!, s2: s2!, grid: grid!, muted: muted!, ink: ink!, surface: surface!, line: line! };
}

/** Chart colours resolved from the theme tokens, updated when the theme toggles. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

export const axisTick = (muted: string) => ({ fill: muted, fontSize: 11, fontFamily: 'var(--font-mono)' });

export function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);
}

export function ChartCard({
  title,
  subtitle,
  children,
  table,
  legend,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  table?: React.ReactNode;
  legend?: { label: string; color: string }[];
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className ?? ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {legend && legend.length > 1 && (
          <ul className="flex gap-4 text-xs font-semibold text-muted" aria-label="Legend">
            {legend.map((l) => (
              <li key={l.label} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-[3px] w-4 rounded-full"
                  style={{ backgroundColor: l.color }}
                  aria-hidden
                />
                {l.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4">{children}</div>
      {table && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Show as table</summary>
          <div className="mt-2 max-h-72 overflow-auto">{table}</div>
        </details>
      )}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="border-b border-line text-muted">
          {head.map((h) => (
            <th key={h} className="py-1.5 pr-3 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line/60">
            {r.map((c, j) => (
              <td key={j} className="py-1.5 pr-3">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tooltip body styled with text tokens; the coloured key carries identity. */
export function TooltipBox({
  active,
  label,
  payload,
  formatLabel,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[];
  formatLabel?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-float)]">
      {label != null && (
        <p className="mb-1 font-semibold text-ink">{formatLabel ? formatLabel(label) : label}</p>
      )}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-mono font-semibold text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  );
}
