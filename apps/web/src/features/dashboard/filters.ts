import { useSearchParams } from 'react-router';

export interface DashFilters {
  q: string;
  status: string[];
  category: string;
  priority: string;
  wardId: string;
  from: string;
  to: string;
  overdue: boolean;
  sort: string;
  page: number;
}

/** Dashboard filters live in the URL so a view can be bookmarked or shared with colleagues. */
export function useDashFilters() {
  const [params, setParams] = useSearchParams();
  const filters: DashFilters = {
    q: params.get('q') ?? '',
    status: params.get('status')?.split(',').filter(Boolean) ?? [],
    category: params.get('category') ?? '',
    priority: params.get('priority') ?? '',
    wardId: params.get('ward') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    overdue: params.get('overdue') === 'true',
    sort: params.get('sort') ?? 'newest',
    page: Number(params.get('page') ?? 1),
  };
  const update = (patch: Partial<DashFilters>) => {
    const next = { ...filters, page: 1, ...patch };
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.status.length) p.set('status', next.status.join(','));
    if (next.category) p.set('category', next.category);
    if (next.priority) p.set('priority', next.priority);
    if (next.wardId) p.set('ward', next.wardId);
    if (next.from) p.set('from', next.from);
    if (next.to) p.set('to', next.to);
    if (next.overdue) p.set('overdue', 'true');
    if (next.sort !== 'newest') p.set('sort', next.sort);
    if (next.page > 1) p.set('page', String(next.page));
    setParams(p, { replace: true });
  };
  const active = Boolean(
    filters.q ||
    filters.status.length ||
    filters.category ||
    filters.priority ||
    filters.wardId ||
    filters.from ||
    filters.to ||
    filters.overdue,
  );
  return { filters, update, active, reset: () => setParams(new URLSearchParams(), { replace: true }) };
}

export function toQuery(f: DashFilters) {
  return {
    q: f.q || undefined,
    status: f.status.length ? f.status.join(',') : undefined,
    category: f.category || undefined,
    priority: f.priority || undefined,
    wardId: f.wardId || undefined,
    from: f.from ? new Date(f.from).toISOString() : undefined,
    to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined,
  };
}
