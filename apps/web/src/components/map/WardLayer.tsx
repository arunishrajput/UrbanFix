import { GeoJSON, Tooltip } from 'react-leaflet';
import type { WardDTO } from '@urbanfix/shared';

export function WardLayer({ wards, highlightId }: { wards: WardDTO[]; highlightId?: string }) {
  return (
    <>
      {wards
        .filter((w) => w.boundary)
        .map((w) => (
          <GeoJSON
            key={`${w.id}-${highlightId === w.id}`}
            data={{ type: 'Feature', properties: {}, geometry: w.boundary! } as GeoJSON.Feature}
            style={{
              color: highlightId === w.id ? '#e8541e' : '#0b6e4f',
              weight: highlightId === w.id ? 3 : 1.5,
              dashArray: '6 6',
              fillOpacity: highlightId === w.id ? 0.08 : 0.02,
            }}
          >
            <Tooltip sticky>
              <span className="font-semibold">
                {w.code} · {w.name}
              </span>
              {w.openIssues != null && <span className="block text-xs">{w.openIssues} open issues</span>}
            </Tooltip>
          </GeoJSON>
        ))}
    </>
  );
}
