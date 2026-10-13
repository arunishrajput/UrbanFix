import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, Marker, useMap, useMapEvents } from 'react-leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import { MapView } from './MapView';
import { pickIcon } from './markers';

function ClickToMove({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().pad(-0.25).contains([lat, lng])) map.panTo([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

/** Map with a draggable pin. Tap the map or drag the pin to correct the location. */
export function LocationPicker({
  lat,
  lng,
  accuracy,
  onChange,
  onLocate,
  locating,
}: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  onChange: (lat: number, lng: number) => void;
  onLocate?: () => void;
  locating?: boolean;
}) {
  const markerRef = useRef<LeafletMarker>(null);
  const handlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (m) onChange(m.getLatLng().lat, m.getLatLng().lng);
      },
    }),
    [onChange],
  );
  return (
    <div className="relative">
      <MapView
        center={[lat, lng]}
        zoom={17}
        className="h-64 rounded-2xl border border-line sm:h-80"
        label="Issue location — drag the pin to adjust"
      >
        <Marker
          position={[lat, lng]}
          icon={pickIcon()}
          draggable
          eventHandlers={handlers}
          ref={markerRef}
          title="Issue location"
        />
        {accuracy != null && accuracy > 0 && accuracy < 500 && (
          <Circle
            center={[lat, lng]}
            radius={accuracy}
            pathOptions={{ color: '#1d6cf2', weight: 1, fillOpacity: 0.08 }}
          />
        )}
        <ClickToMove onPick={onChange} />
        <Recenter lat={lat} lng={lng} />
      </MapView>
      {onLocate && (
        <button
          type="button"
          onClick={onLocate}
          className="absolute bottom-3 right-3 z-[500] inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-semibold shadow-[var(--shadow-card)]"
        >
          <LocateFixed className={locating ? 'size-4 animate-pulse text-signal' : 'size-4'} />
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      )}
    </div>
  );
}
