import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression, Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

const TILE_URL =
  (import.meta.env.VITE_MAP_TILE_URL as string | undefined) ||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function MapView({
  center,
  zoom = 14,
  className,
  children,
  onReady,
  scrollWheelZoom = true,
  label = 'Map of reported issues',
}: {
  center: LatLngExpression;
  zoom?: number;
  className?: string;
  children?: React.ReactNode;
  onReady?: (map: LeafletMap) => void;
  scrollWheelZoom?: boolean;
  label?: string;
}) {
  return (
    <div className={cn('relative isolate overflow-hidden', className)} role="region" aria-label={label}>
      <MapContainer
        center={center}
        zoom={zoom}
        className="size-full"
        zoomControl={false}
        scrollWheelZoom={scrollWheelZoom}
        ref={(m) => {
          if (m) onReady?.(m);
        }}
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
        {children}
      </MapContainer>
    </div>
  );
}

export interface ViewState {
  bbox: string;
  zoom: number;
}

/** Reports the visible bounding box (debounced) so the parent can fetch points for it. */
export function ViewWatcher({ onChange }: { onChange: (v: ViewState) => void }) {
  const map = useMap();
  const timer = useRef<number | undefined>(undefined);
  const emit = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const b = map.getBounds();
      const f = (n: number) => n.toFixed(4);
      onChange({
        bbox: [f(b.getWest()), f(b.getSouth()), f(b.getEast()), f(b.getNorth())].join(','),
        zoom: map.getZoom(),
      });
    }, 250);
  };
  useMapEvents({ moveend: emit, zoomend: emit });
  useEffect(() => {
    emit();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }, [bounds, map]);
  return null;
}

export function FlyTo({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom ?? Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}
