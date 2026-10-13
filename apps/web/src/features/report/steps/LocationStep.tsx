import { useQuery } from '@tanstack/react-query';
import { Camera, MapPin } from 'lucide-react';
import { useEffect } from 'react';
import type { UploadDTO } from '@urbanfix/shared';
import { LocationPicker } from '../../../components/map/LocationPicker';
import { Skeleton } from '../../../components/ui/misc';
import { api } from '../../../lib/api';
import { coords } from '../../../lib/format';
import { useGeolocation } from '../../../lib/geo';
import { useDebounced } from '../../../lib/hooks';
import { useConfig } from '../../../lib/reference';
import { useReportDraft } from '../store';

export function LocationStep({ uploads }: { uploads: (UploadDTO | undefined)[] }) {
  const { location, setLocation, address, setAddress } = useReportDraft();
  const { data: config } = useConfig();
  const geo = useGeolocation({ auto: !location || location.source === 'gps' });
  const exif = uploads.find((u) => u?.exifLocation)?.exifLocation ?? null;

  // Take GPS fixes as they improve, unless the citizen moved the pin themselves.
  useEffect(() => {
    const fix = geo.fix;
    if (!fix) return;
    const current = useReportDraft.getState().location;
    if (current && current.source !== 'gps') return;
    if (current && current.lat === fix.lat && current.lng === fix.lng && current.accuracy === fix.accuracy)
      return;
    setLocation({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, source: 'gps' });
  }, [geo.fix, setLocation]);

  // No GPS? Fall back to the photo's EXIF location, then the city centre.
  const exifLat = exif?.lat;
  const exifLng = exif?.lng;
  useEffect(() => {
    if (useReportDraft.getState().location || geo.status !== 'error') return;
    if (exifLat != null && exifLng != null)
      setLocation({ lat: exifLat, lng: exifLng, accuracy: null, source: 'photo' });
  }, [geo.status, exifLat, exifLng, setLocation]);

  const point =
    location ??
    (geo.status === 'error' && config
      ? { ...config.city.center, accuracy: null, source: 'map' as const }
      : null);
  const key = point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : '';
  const debouncedKey = useDebounced(key, 600);
  const { data: geocoded, isFetching } = useQuery({
    queryKey: ['geocode', debouncedKey],
    queryFn: () => {
      const [lat, lng] = debouncedKey.split(',');
      return api<{ address: string | null }>('/geo/reverse', { query: { lat, lng } });
    },
    enabled: Boolean(debouncedKey),
    staleTime: Infinity,
  });
  useEffect(() => {
    if (geocoded) setAddress(geocoded.address);
  }, [geocoded, setAddress]);

  return (
    <div>
      <h2 className="text-2xl font-black">Where is it?</h2>
      <p className="mt-1 text-sm text-muted">
        We used your location. Drag the pin or tap the map if it is not exactly right.
      </p>
      <div className="mt-5">
        {point ? (
          <LocationPicker
            lat={point.lat}
            lng={point.lng}
            accuracy={location?.source === 'gps' ? location.accuracy : null}
            onChange={(lat, lng) => setLocation({ lat, lng, accuracy: null, source: 'map' })}
            onLocate={() => {
              setLocation({ ...(location ?? point), source: 'gps' });
              geo.locate();
            }}
            locating={geo.status === 'locating'}
          />
        ) : (
          <div className="grid h-64 place-items-center rounded-2xl border border-line bg-surface-2 sm:h-80">
            <div className="text-center">
              <span className="lane-line-h lane-moving mx-auto block h-1.5 w-24 rounded-full" />
              <p className="mt-3 text-sm font-semibold text-muted">Finding your location…</p>
            </div>
          </div>
        )}
      </div>
      {geo.status === 'error' && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">{geo.error}</p>
      )}
      {exif && location?.source !== 'photo' && (
        <button
          onClick={() => setLocation({ ...exif, accuracy: null, source: 'photo' })}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-signal"
        >
          <Camera className="size-4" /> Use the location stored in the photo
        </button>
      )}
      <div className="card mt-4 flex items-start gap-3 p-4">
        <MapPin className="mt-0.5 size-5 shrink-0 text-cone" />
        <div className="min-w-0">
          {isFetching && !address ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <p className="font-semibold">{address ?? 'Address not found — the pin location will be used'}</p>
          )}
          {point && (
            <p className="mt-0.5 font-mono text-xs text-muted">
              {coords(point.lat, point.lng)}
              {location?.accuracy ? ` · ±${Math.round(location.accuracy)} m` : ''}
              {location?.source === 'photo'
                ? ' · from photo'
                : location?.source === 'map'
                  ? ' · set on map'
                  : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
