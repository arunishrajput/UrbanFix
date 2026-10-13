import { useMemo, useState } from 'react';
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import Supercluster from 'supercluster';
import type { CategoryDTO, MapPoint } from '@urbanfix/shared';
import { clusterIcon, issueIcon } from './markers';

type Props = { id: string; point: MapPoint };

/** Client-side clustering (supercluster) of issue points with signpost markers. */
export function IssueMarkers({
  points,
  categories,
  selectedId,
  freshIds,
  onSelect,
}: {
  points: MapPoint[];
  categories: Map<string, CategoryDTO>;
  selectedId?: string | null;
  freshIds?: Set<string>;
  onSelect: (p: MapPoint) => void;
}) {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({ moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }) });

  const index = useMemo(() => {
    const sc = new Supercluster<Props>({ radius: 56, maxZoom: 16 });
    sc.load(
      points.map((p) => ({
        type: 'Feature' as const,
        properties: { id: p.id, point: p },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      })),
    );
    return sc;
  }, [points]);

  const b = view.bounds;
  const clusters = index.getClusters(
    [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    Math.round(view.zoom),
  );

  return (
    <>
      {clusters.map((c) => {
        const [lng, lat] = c.geometry.coordinates as [number, number];
        if ('cluster' in c.properties && c.properties.cluster) {
          const count = (c.properties as { point_count: number }).point_count;
          const id = c.id as number;
          return (
            <Marker
              key={`c-${id}`}
              position={[lat, lng]}
              icon={clusterIcon(count)}
              keyboard
              title={`${count} issues — zoom in`}
              eventHandlers={{
                click: () =>
                  map.flyTo([lat, lng], Math.min(index.getClusterExpansionZoom(id), 18), { duration: 0.6 }),
              }}
            />
          );
        }
        const p = (c.properties as Props).point;
        const cat = categories.get(p.category);
        return (
          <Marker
            key={p.id}
            position={[lat, lng]}
            icon={issueIcon({
              icon: cat?.icon ?? 'CircleHelp',
              color: cat?.color ?? '#64748b',
              status: p.status,
              priority: p.priority,
              selected: p.id === selectedId,
              pulse: freshIds?.has(p.id),
            })}
            keyboard
            title={p.title}
            zIndexOffset={p.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(p) }}
          >
            <Tooltip direction="top" offset={[0, -40]} opacity={1}>
              <span className="font-semibold">{p.title}</span>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
