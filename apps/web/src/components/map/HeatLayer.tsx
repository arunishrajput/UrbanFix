import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { HeatPoint } from '@urbanfix/shared';

type HeatLayerFactory = (
  latlngs: HeatPoint[],
  options: Record<string, unknown>,
) => L.Layer & { setLatLngs(p: HeatPoint[]): void };

let loaded: Promise<HeatLayerFactory> | null = null;
/** leaflet.heat expects a global `L`; load it lazily once. */
function loadHeat(): Promise<HeatLayerFactory> {
  loaded ??= (async () => {
    (window as unknown as { L: typeof L }).L = L;
    await import('leaflet.heat');
    return (L as unknown as { heatLayer: HeatLayerFactory }).heatLayer;
  })();
  return loaded;
}

export function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  useEffect(() => {
    let layer: (L.Layer & { setLatLngs(p: HeatPoint[]): void }) | null = null;
    let cancelled = false;
    void loadHeat().then((heatLayer) => {
      if (cancelled) return;
      layer = heatLayer(points, {
        radius: 26,
        blur: 22,
        maxZoom: 16,
        minOpacity: 0.35,
        gradient: { 0.25: '#0b6e4f', 0.5: '#f5c518', 0.75: '#f08a24', 1: '#e8541e' },
      });
      layer.addTo(map);
    });
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}
