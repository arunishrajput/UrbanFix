import { ArrowRight, Eye, MapPin, ThumbsUp, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { formatDistance, type DuplicateCandidateDTO, type DuplicateCheckResult } from '@urbanfix/shared';
import { MapContainer, TileLayer, Marker, Circle, Polyline } from 'react-leaflet';
import { StatusPill } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Photo } from '../../components/ui/Photo';
import { issueIcon, pickIcon } from '../../components/map/markers';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../lib/format';
import { useCategoryMap } from '../../lib/reference';

function CandidateMap({
  origin,
  result,
}: {
  origin: { lat: number; lng: number };
  result: DuplicateCheckResult;
}) {
  const categories = useCategoryMap();
  return (
    <div className="h-44 overflow-hidden rounded-2xl border border-line">
      <MapContainer
        center={[origin.lat, origin.lng]}
        zoom={18}
        className="size-full"
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
      >
        <TileLayer
          url={
            (import.meta.env.VITE_MAP_TILE_URL as string) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
        />
        <Circle
          center={[origin.lat, origin.lng]}
          radius={result.radiusM}
          pathOptions={{ color: '#e8541e', weight: 1, dashArray: '4 6', fillOpacity: 0.04 }}
        />
        {result.candidates.map((c) => {
          const cat = categories.get(c.issue.category.slug);
          return (
            <span key={c.issue.id}>
              <Polyline
                positions={[
                  [origin.lat, origin.lng],
                  [c.issue.lat, c.issue.lng],
                ]}
                pathOptions={{ color: '#f5c518', weight: 3, dashArray: '6 6' }}
              />
              <Marker
                position={[c.issue.lat, c.issue.lng]}
                icon={issueIcon({
                  icon: cat?.icon ?? 'CircleHelp',
                  color: c.issue.category.color,
                  status: c.issue.status,
                })}
              />
            </span>
          );
        })}
        <Marker position={[origin.lat, origin.lng]} icon={pickIcon()} />
      </MapContainer>
    </div>
  );
}

function CandidateCard({
  c,
  index,
  onJoin,
  joining,
}: {
  c: DuplicateCandidateDTO;
  index: number;
  onJoin: (c: DuplicateCandidateDTO) => void;
  joining: boolean;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + index * 0.08 }}
      className={cn('card overflow-hidden', c.level === 'LIKELY' && 'border-lane ring-2 ring-lane/60')}
    >
      <div className="flex gap-3 p-3">
        {c.issue.coverPhoto ? (
          <Photo
            src={c.issue.coverPhoto.thumbUrl}
            thumbhash={c.issue.coverPhoto.thumbhash}
            alt={c.issue.title}
            className="size-24 shrink-0 rounded-xl"
          />
        ) : (
          <div className="size-24 shrink-0 rounded-xl bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 font-display text-[0.65rem] font-extrabold uppercase tracking-wider',
                c.level === 'LIKELY' ? 'bg-lane text-lane-ink' : 'bg-surface-2 text-muted',
              )}
            >
              {c.level === 'LIKELY' ? 'Likely the same' : 'Possibly the same'}
            </span>
            <StatusPill status={c.issue.status} />
          </div>
          <p className="mt-1.5 line-clamp-2 font-display font-extrabold leading-snug">{c.issue.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1 font-mono font-semibold text-ink">
              <MapPin className="size-3.5 text-cone" /> {formatDistance(c.distanceM)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="size-3.5" /> {c.issue.supportCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {c.issue.reporterCount}
            </span>
            <span>{timeAgo(c.issue.createdAt)}</span>
          </p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5 px-3 pb-3" aria-label="Why we think it matches">
        {c.reasons.map((r) => (
          <li
            key={r.code + r.label}
            className="rounded-full bg-surface-2 px-2.5 py-1 text-[0.72rem] font-semibold"
          >
            {r.label}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 border-t border-line p-3">
        {c.alreadyReported ? (
          <Link
            to={`/issues/${c.issue.id}`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-asphalt font-display font-bold text-white"
          >
            <Eye className="size-4" /> You reported this — view it
          </Link>
        ) : (
          <Button className="flex-1" onClick={() => onJoin(c)} loading={joining}>
            Join this issue
          </Button>
        )}
        <Link
          to={`/issues/${c.issue.id}`}
          target="_blank"
          className="inline-flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface-2"
          aria-label="Open issue details in a new tab"
        >
          Details <ArrowRight className="size-4" />
        </Link>
      </div>
    </motion.li>
  );
}

/**
 * Shown before submission when nearby issues look like the same problem.
 * Joining adds the citizen's photo as evidence; "create new" records that they
 * looked and decided it is different.
 */
export function DuplicateReview({
  result,
  origin,
  onJoin,
  onCreateNew,
  joiningId,
}: {
  result: DuplicateCheckResult;
  origin: { lat: number; lng: number };
  onJoin: (c: DuplicateCandidateDTO) => void;
  onCreateNew: () => void;
  joiningId: string | null;
}) {
  const own = result.candidates.some((c) => c.alreadyReported);
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-asphalt p-4 text-white"
      >
        <p className="sign-label !text-lane">Before you submit</p>
        <p className="mt-1 font-display text-xl font-extrabold leading-snug">{result.headline}</p>
        <p className="mt-1 text-sm text-white/70">
          Joining adds your photo as evidence and raises its priority. A separate complaint would split the
          attention.
        </p>
      </motion.div>
      <div className="mt-4">
        <CandidateMap origin={origin} result={result} />
      </div>
      <ul className="mt-4 space-y-3">
        {result.candidates.map((c, i) => (
          <CandidateCard
            key={c.issue.id}
            c={c}
            index={i}
            onJoin={onJoin}
            joining={joiningId === c.issue.id}
          />
        ))}
      </ul>
      {!own && (
        <div className="mt-5 text-center">
          <Button variant="ghost" onClick={onCreateNew} disabled={Boolean(joiningId)}>
            None of these — create a new issue
          </Button>
        </div>
      )}
    </div>
  );
}
