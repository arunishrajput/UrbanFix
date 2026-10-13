import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Flame, List, LocateFixed, MapPin, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Marker } from 'react-leaflet';
import type { HeatPoint, IssueDetail, MapPoint } from '@urbanfix/shared';
import { HeatLayer } from '../../components/map/HeatLayer';
import { IssueMarkers } from '../../components/map/IssueMarkers';
import { FlyTo, MapView, ViewWatcher, type ViewState } from '../../components/map/MapView';
import { userIcon } from '../../components/map/markers';
import { WardLayer } from '../../components/map/WardLayer';
import { PriorityBadge, StatusPill } from '../../components/ui/Badge';
import { iconFor } from '../../components/ui/icons';
import { Photo } from '../../components/ui/Photo';
import { Segmented } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../lib/format';
import { useGeolocation } from '../../lib/geo';
import { qk } from '../../lib/query';
import { useSocketEvent } from '../../lib/realtime';
import { useCategories, useCategoryMap, useConfig, useWards } from '../../lib/reference';

type Layer = 'pins' | 'heat';
type StatusFilter = 'open' | 'all';
const OPEN = ['PENDING', 'IN_PROGRESS', 'REOPENED', 'RESOLVED'];

function Preview({ point, onClose }: { point: MapPoint; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: qk.issue(point.id),
    queryFn: () => api<IssueDetail>(`/issues/${point.id}`),
  });
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      className="card absolute inset-x-3 bottom-24 z-[600] overflow-hidden md:bottom-6 md:left-auto md:right-6 md:w-96"
      role="dialog"
      aria-label={point.title}
    >
      <div className="flex gap-3 p-3">
        {data?.coverPhoto ? (
          <Photo
            src={data.coverPhoto.thumbUrl}
            thumbhash={data.coverPhoto.thumbhash}
            alt=""
            className="size-24 shrink-0 rounded-xl"
          />
        ) : (
          <div className="skeleton size-24 shrink-0 rounded-xl" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusPill status={point.status} />
            <PriorityBadge priority={point.priority} />
          </div>
          <p className="mt-1.5 line-clamp-2 font-display font-extrabold leading-snug">{point.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{data?.address ?? '…'}</p>
          <p className="mt-1 font-mono text-[0.7rem] text-muted">
            {data ? `${data.ref} · ${data.supportCount} supporting · ${timeAgo(data.createdAt)}` : ' '}
          </p>
        </div>
        <button
          onClick={onClose}
          className="self-start rounded-full p-1.5 text-muted hover:bg-surface-2"
          aria-label="Close preview"
        >
          <X className="size-4" />
        </button>
      </div>
      <Link
        to={`/issues/${point.id}`}
        className="block border-t border-line px-4 py-3 text-center font-display font-bold text-signal hover:bg-surface-2"
      >
        Open issue
      </Link>
    </motion.div>
  );
}

export default function MapPage() {
  const { data: config } = useConfig();
  const { data: categories } = useCategories();
  const catMap = useCategoryMap();
  const { data: wards } = useWards();
  const geo = useGeolocation({ auto: true, targetAccuracy: 100, timeoutMs: 8000 });
  const [view, setView] = useState<ViewState | null>(null);
  const [layer, setLayer] = useState<Layer>('pins');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const params = {
    bbox: view?.bbox,
    category: selectedCats.join(','),
    status: status === 'open' ? OPEN.join(',') : undefined,
  };
  const points = useQuery({
    queryKey: qk.map(params),
    queryFn: () => api<{ points: MapPoint[]; truncated: boolean }>('/issues/map', { query: params }),
    enabled: Boolean(view) && layer === 'pins',
    placeholderData: keepPreviousData,
  });
  const heat = useQuery({
    queryKey: qk.heat(params),
    queryFn: () => api<{ points: HeatPoint[] }>('/issues/heatmap', { query: params }),
    enabled: Boolean(view) && layer === 'heat',
    placeholderData: keepPreviousData,
  });

  // Newly reported issues pulse briefly when they appear live.
  useSocketEvent('issue:created', (p) => {
    setFresh((f) => new Set(f).add(p.id));
    setTimeout(
      () =>
        setFresh((f) => {
          const n = new Set(f);
          n.delete(p.id);
          return n;
        }),
      12_000,
    );
  });

  const center = useMemo<[number, number] | null>(() => {
    if (config) return [config.city.center.lat, config.city.center.lng];
    return null;
  }, [config]);

  const fixLat = geo.fix ? Number(geo.fix.lat.toFixed(4)) : null;
  const fixLng = geo.fix ? Number(geo.fix.lng.toFixed(4)) : null;
  const fixCenter = useMemo<[number, number] | null>(
    () => (fixLat != null && fixLng != null ? [fixLat, fixLng] : null),
    [fixLat, fixLng],
  );

  const visible = points.data?.points ?? [];
  const toggleCat = (slug: string) =>
    setSelectedCats((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  return (
    <div className="relative h-[calc(100dvh-4rem)]">
      {center && (
        <MapView center={center} zoom={13} className="size-full">
          <ViewWatcher onChange={setView} />
          <FlyTo center={flyTo ?? fixCenter} zoom={15} />
          {wards && <WardLayer wards={wards} />}
          {layer === 'pins' && (
            <IssueMarkers
              points={visible}
              categories={catMap}
              selectedId={selected?.id}
              freshIds={fresh}
              onSelect={setSelected}
            />
          )}
          {layer === 'heat' && heat.data && <HeatLayer points={heat.data.points} />}
          {geo.fix && <Marker position={[geo.fix.lat, geo.fix.lng]} icon={userIcon()} title="You are here" />}
        </MapView>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] space-y-2 p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Segmented
            label="Map layer"
            value={layer}
            onChange={setLayer}
            options={[
              {
                value: 'pins',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-4" /> Pins
                  </span>
                ),
              },
              {
                value: 'heat',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Flame className="size-4" /> Heatmap
                  </span>
                ),
              },
            ]}
            className="bg-surface/95 shadow-[var(--shadow-card)] backdrop-blur"
          />
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'all', label: 'All' },
            ]}
            className="bg-surface/95 shadow-[var(--shadow-card)] backdrop-blur"
          />
          <span
            className="ml-auto rounded-full bg-asphalt px-3 py-1.5 font-mono text-xs font-semibold text-lane shadow-[var(--shadow-card)]"
            aria-live="polite"
          >
            {layer === 'pins'
              ? `${visible.length}${points.data?.truncated ? '+' : ''} issues in view`
              : `${heat.data?.points.length ?? 0} reports`}
          </span>
        </div>
        <div
          className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]"
          role="group"
          aria-label="Filter by category"
        >
          {categories?.map((c) => {
            const Icon = iconFor(c.icon);
            const on = selectedCats.includes(c.slug);
            return (
              <button
                key={c.slug}
                onClick={() => toggleCat(c.slug)}
                aria-pressed={on}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors',
                  on ? 'border-transparent text-white' : 'border-line bg-surface/95 text-ink backdrop-blur',
                )}
                style={on ? { backgroundColor: c.color } : undefined}
              >
                <Icon className="size-4" style={on ? undefined : { color: c.color }} /> {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-24 right-3 z-[600] flex flex-col gap-2 md:bottom-6">
        <button
          onClick={() => setListOpen(true)}
          className="grid size-12 place-items-center rounded-2xl bg-surface shadow-[var(--shadow-float)]"
          aria-label="Show issues as a list"
        >
          <List className="size-5" />
        </button>
        <button
          onClick={() => (geo.fix ? setFlyTo([geo.fix.lat, geo.fix.lng]) : geo.locate())}
          className="grid size-12 place-items-center rounded-2xl bg-surface shadow-[var(--shadow-float)]"
          aria-label="Centre on my location"
        >
          <LocateFixed className={cn('size-5', geo.status === 'locating' && 'animate-pulse text-signal')} />
        </button>
      </div>

      <AnimatePresence>
        {selected && !listOpen && (
          <Preview key={selected.id} point={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {listOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 right-0 z-[700] flex w-full flex-col bg-surface shadow-[var(--shadow-float)] sm:w-96"
            aria-label="Issues in view"
          >
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="text-lg font-black">{visible.length} issues in view</h2>
              <button
                onClick={() => setListOpen(false)}
                className="rounded-full p-2 hover:bg-surface-2"
                aria-label="Close list"
              >
                <X className="size-5" />
              </button>
            </div>
            <ul className="flex-1 divide-y divide-line overflow-y-auto">
              {visible.slice(0, 200).map((p) => {
                const c = catMap.get(p.category);
                const Icon = iconFor(c?.icon);
                return (
                  <li key={p.id}>
                    <Link to={`/issues/${p.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                        style={{ backgroundColor: c?.color }}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.title}</span>
                        <span className="text-xs text-muted">
                          {c?.name} · {p.supportCount} supporting
                        </span>
                      </span>
                      <StatusPill status={p.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
