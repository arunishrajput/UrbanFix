import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { geoJsonBoundarySchema, type WardDTO } from '@urbanfix/shared';
import { MapView } from '../../components/map/MapView';
import { WardLayer } from '../../components/map/WardLayer';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { qk } from '../../lib/query';
import { useConfig } from '../../lib/reference';

function WardEditor({
  ward,
  open,
  onOpenChange,
}: {
  ward: WardDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [geojson, setGeojson] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastWard, setLastWard] = useState<string | null | undefined>(undefined);
  if (open && lastWard !== (ward?.id ?? null)) {
    setLastWard(ward?.id ?? null);
    setCode(ward?.code ?? '');
    setName(ward?.name ?? '');
    setGeojson(ward?.boundary ? JSON.stringify(ward.boundary) : '');
    setActive(ward?.isActive ?? true);
    setError(null);
  }
  const save = useMutation({
    mutationFn: () => {
      let boundary: unknown = undefined;
      if (geojson.trim()) {
        const raw = JSON.parse(geojson);
        const geometry =
          raw.type === 'Feature'
            ? raw.geometry
            : raw.type === 'FeatureCollection'
              ? raw.features?.[0]?.geometry
              : raw;
        boundary = geoJsonBoundarySchema.parse(geometry);
      }
      return api(ward ? `/admin/wards/${ward.id}` : '/admin/wards', {
        method: ward ? 'PUT' : 'POST',
        body: { code, name, isActive: active, boundary },
      });
    },
    onSuccess: () => {
      toast.success('Ward saved');
      qc.invalidateQueries({ queryKey: ['admin', 'wards'] });
      qc.invalidateQueries({ queryKey: qk.wards });
      onOpenChange(false);
      setLastWard(undefined);
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof SyntaxError
            ? 'The boundary is not valid JSON'
            : 'Boundary must be a GeoJSON Polygon or MultiPolygon',
      ),
  });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (onOpenChange(o), !o && setLastWard(undefined))}
      title={ward ? `Edit ${ward.name}` : 'New ward'}
      description="Issues are assigned to the ward whose boundary contains them."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Textarea
          label="Boundary (GeoJSON)"
          rows={6}
          className="font-mono text-xs"
          value={geojson}
          onChange={(e) => setGeojson(e.target.value)}
          hint="Paste a Polygon / MultiPolygon geometry or Feature, or load a .geojson file."
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-signal">
          <Upload className="size-4" /> Load .geojson file
          <input
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setGeojson(await f.text());
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--signal)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{' '}
          Active
        </label>
        {error && <p className="text-sm text-cone-ink">{error}</p>}
        <Button
          className="w-full"
          size="lg"
          disabled={!code || !name}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          Save ward
        </Button>
      </div>
    </Sheet>
  );
}

export default function AdminWardsPage() {
  const { data: config } = useConfig();
  const { data } = useQuery({ queryKey: qk.admin('wards'), queryFn: () => api<WardDTO[]>('/admin/wards') });
  const [selected, setSelected] = useState<WardDTO | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sign-label">Administration</p>
          <h1 className="text-3xl font-black">Wards</h1>
        </div>
        <Button onClick={() => (setSelected(null), setOpen(true))}>
          <Plus className="size-4" /> New ward
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        {!data ? (
          <Skeleton className="h-96" />
        ) : (
          <ul className="card divide-y divide-line">
            {data.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => (setSelected(w), setOpen(true))}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-asphalt font-mono text-xs font-bold text-lane">
                    {w.code}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{w.name}</span>
                    <span className="text-xs text-muted">
                      {w.boundary ? 'Boundary set' : 'No boundary — nearest-centre fallback'} ·{' '}
                      {w.openIssues ?? 0} open issues
                      {!w.isActive && ' · inactive'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {config && (
          <MapView
            center={[config.city.center.lat, config.city.center.lng]}
            zoom={12}
            className="h-[30rem] rounded-[var(--radius-card)] border border-line"
            label="Ward boundaries"
          >
            {data && <WardLayer wards={data} highlightId={selected?.id} />}
          </MapView>
        )}
      </div>
      <WardEditor ward={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
