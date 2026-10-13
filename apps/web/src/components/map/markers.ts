import L from 'leaflet';
import {
  BadgeCheck,
  CircleHelp,
  Construction,
  Droplets,
  Footprints,
  Lightbulb,
  PackageX,
  Pipette,
  TrafficCone,
  Trash2,
  TreeDeciduous,
  Waves,
  type IconNode,
} from 'lucide';
import type { IssueStatus, Priority } from '@urbanfix/shared';

// Leaflet markers are plain HTML strings, so icons come from lucide's vanilla icon data.
const NODES: Record<string, IconNode> = {
  Trash2,
  Construction,
  Waves,
  Droplets,
  Pipette,
  Lightbulb,
  PackageX,
  TreeDeciduous,
  Footprints,
  TrafficCone,
  CircleHelp,
  BadgeCheck,
};

const escapeAttr = (v: unknown) =>
  String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const svgCache = new Map<string, string>();
function iconSvg(name: string) {
  let svg = svgCache.get(name);
  if (!svg) {
    const children = (NODES[name] ?? CircleHelp)
      .map(
        ([tag, attrs]) =>
          `<${tag} ${Object.entries(attrs)
            .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
            .join(' ')}/>`,
      )
      .join('');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
    svgCache.set(name, svg);
  }
  return svg;
}

const STATUS_RING: Record<IssueStatus, string> = {
  PENDING: '#f5c518',
  IN_PROGRESS: '#3b6cf6',
  RESOLVED: '#0b6e4f',
  VERIFIED: '#0b6e4f',
  REOPENED: '#e8541e',
  REJECTED: '#9ca3af',
};

/** A signpost-shaped pin: category colour plate, status ring, pointer at the exact spot. */
export function issueIcon(opts: {
  icon: string;
  color: string;
  status: IssueStatus;
  priority?: Priority;
  selected?: boolean;
  pulse?: boolean;
}) {
  const size = opts.selected ? 40 : 32;
  const faded = opts.status === 'VERIFIED' || opts.status === 'REJECTED';
  const urgent = opts.priority === 'CRITICAL';
  const html = `
    <div class="uf-pin ${opts.pulse ? 'uf-pulse' : ''}" style="position:relative;width:${size}px;height:${size + 10}px;opacity:${faded ? 0.6 : 1}">
      <div style="width:${size}px;height:${size}px;border-radius:10px;background:${opts.color};display:grid;place-items:center;
        box-shadow:0 0 0 3px ${STATUS_RING[opts.status]}, 0 6px 14px -4px rgba(0,0,0,.45);">
        ${iconSvg(opts.icon)}
      </div>
      <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid ${STATUS_RING[opts.status]}"></div>
      ${urgent ? '<span style="position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:99px;background:#e8541e;border:2px solid white"></span>' : ''}
    </div>`;
  return L.divIcon({
    html,
    className: 'uf-marker',
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 10],
  });
}

export function clusterIcon(count: number) {
  const size = count < 10 ? 38 : count < 50 ? 46 : 56;
  const html = `<div style="width:${size}px;height:${size}px;border-radius:999px;background:#24272b;color:#f5c518;
    display:grid;place-items:center;font-family:'Overpass Mono Variable',monospace;font-weight:700;font-size:${count < 100 ? 14 : 12}px;
    border:3px dashed #f5c518;box-shadow:0 8px 18px -6px rgba(0,0,0,.5)">${count}</div>`;
  return L.divIcon({
    html,
    className: 'uf-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function userIcon() {
  return L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:99px;background:#1d6cf2;border:3px solid white;box-shadow:0 0 0 6px rgba(29,108,242,.25)"></div>`,
    className: 'uf-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export function pickIcon() {
  return L.divIcon({
    html: `<div class="uf-pin" style="width:36px;height:48px;position:relative">
      <div style="width:36px;height:36px;border-radius:999px 999px 999px 0;transform:rotate(-45deg);background:#e8541e;border:3px solid white;box-shadow:0 8px 16px -6px rgba(0,0,0,.5)"></div>
      <div style="position:absolute;top:11px;left:11px;width:14px;height:14px;border-radius:99px;background:white"></div></div>`,
    className: 'uf-marker',
    iconSize: [36, 48],
    iconAnchor: [18, 46],
  });
}
