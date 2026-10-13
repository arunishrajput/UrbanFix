/**
 * Generates simple illustrated "photos" for seed data, one scene per category,
 * with random variation so perceptual hashes differ between issues.
 */
import sharp from 'sharp';

export type Rand = () => number;

const W = 1200;
const H = 900;

const pick = <T>(r: Rand, xs: T[]) => xs[Math.floor(r() * xs.length)]!;
const between = (r: Rand, a: number, b: number) => a + r() * (b - a);

function sky(r: Rand, night = false) {
  const top = night ? '#0f172a' : pick(r, ['#7dd3fc', '#93c5fd', '#bae6fd', '#cbd5e1']);
  const bottom = night ? '#1e293b' : pick(r, ['#e0f2fe', '#f1f5f9', '#fef3c7']);
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>`;
}

function buildings(r: Rand, night = false) {
  let s = '';
  let x = -20;
  while (x < W) {
    const w = between(r, 90, 200);
    const h = between(r, 180, 380);
    const c = night
      ? pick(r, ['#1e293b', '#334155'])
      : pick(r, ['#e2e8f0', '#fde68a', '#fecaca', '#d9f99d', '#e9d5ff', '#cbd5e1']);
    s += `<rect x="${x}" y="${470 - h}" width="${w}" height="${h}" fill="${c}"/>`;
    for (let wy = 470 - h + 25; wy < 440; wy += 55) {
      for (let wx = x + 15; wx < x + w - 30; wx += 45) {
        const lit = night ? (r() > 0.5 ? '#fde047' : '#475569') : '#94a3b8';
        s += `<rect x="${wx}" y="${wy}" width="22" height="28" fill="${lit}" opacity="0.8"/>`;
      }
    }
    x += w + between(r, 4, 20);
  }
  return s;
}

const road = (r: Rand) =>
  `<rect y="470" width="${W}" height="${H - 470}" fill="${pick(r, ['#4b5563', '#52525b', '#57534e'])}"/>
   <rect y="470" width="${W}" height="40" fill="#a8a29e"/>
   ${Array.from({ length: 6 }, (_, i) => `<rect x="${i * 220 + between(r, 0, 40)}" y="720" width="120" height="14" fill="#f8fafc" opacity="0.9"/>`).join('')}`;

const ground = (r: Rand) =>
  `<rect y="470" width="${W}" height="${H - 470}" fill="${pick(r, ['#a8a29e', '#d6d3d1', '#78716c'])}"/>`;

function debris(r: Rand, n: number, cx: number, cy: number, spread: number, palette: string[]) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = cx + between(r, -spread, spread);
    const y = cy + between(r, -spread / 3, spread / 3);
    const w = between(r, 20, 70);
    const h = between(r, 14, 46);
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${between(r, 2, 12)}" fill="${pick(r, palette)}" transform="rotate(${between(r, -40, 40)} ${x} ${y})"/>`;
  }
  return s;
}

const scenes: Record<string, (r: Rand) => string> = {
  garbage: (r) => {
    const x = between(r, 300, 700);
    return `${sky(r)}${buildings(r)}${ground(r)}
      <rect x="${x}" y="470" width="190" height="240" rx="14" fill="#15803d"/>
      <rect x="${x - 12}" y="452" width="214" height="34" rx="8" fill="#166534"/>
      ${debris(r, 45, x + 90, 700, 260, ['#f97316', '#eab308', '#e2e8f0', '#1e293b', '#3b82f6', '#a16207', '#f1f5f9'])}`;
  },
  'road-pothole': (r) => {
    const cx = between(r, 400, 800);
    const cy = between(r, 640, 760);
    return `${sky(r)}${buildings(r)}${road(r)}
      <ellipse cx="${cx}" cy="${cy}" rx="${between(r, 140, 230)}" ry="${between(r, 50, 85)}" fill="#1c1917"/>
      <ellipse cx="${cx + 10}" cy="${cy + 8}" rx="${between(r, 90, 150)}" ry="${between(r, 25, 45)}" fill="#3f6212" opacity="0.6"/>
      ${debris(r, 18, cx, cy, 200, ['#78716c', '#57534e', '#a8a29e'])}`;
  },
  'broken-drain': (r) => {
    const x = between(r, 250, 650);
    return `${sky(r)}${buildings(r)}${road(r)}
      <rect x="${x}" y="560" width="360" height="200" fill="#1c1917"/>
      ${Array.from({ length: 9 }, (_, i) => `<rect x="${x + 10 + i * 40}" y="570" width="14" height="180" fill="#57534e" transform="rotate(${r() > 0.7 ? between(r, -25, 25) : 0} ${x + i * 40} 650)"/>`).join('')}
      <ellipse cx="${x + 180}" cy="790" rx="320" ry="60" fill="#65a30d" opacity="0.55"/>`;
  },
  'water-leakage': (r) => {
    const x = between(r, 200, 600);
    return `${sky(r)}${buildings(r)}${ground(r)}
      <rect x="${x}" y="500" width="460" height="46" rx="20" fill="#64748b"/>
      <rect x="${x + 200}" y="490" width="60" height="66" rx="8" fill="#475569"/>
      ${Array.from({ length: 14 }, () => `<line x1="${x + 230}" y1="500" x2="${x + 230 + between(r, -160, 160)}" y2="${between(r, 380, 470)}" stroke="#38bdf8" stroke-width="${between(r, 3, 8)}" stroke-linecap="round" opacity="0.8"/>`).join('')}
      <ellipse cx="${x + 230}" cy="760" rx="${between(r, 280, 380)}" ry="80" fill="#0ea5e9" opacity="0.55"/>`;
  },
  'broken-pipeline': (r) => {
    const y = between(r, 600, 700);
    return `${sky(r)}${buildings(r)}${ground(r)}
      <rect x="0" y="${y}" width="${W}" height="90" fill="#78350f" opacity="0.5"/>
      <rect x="0" y="${y + 20}" width="520" height="50" fill="#334155"/>
      <rect x="600" y="${y + 26}" width="600" height="50" fill="#334155" transform="rotate(${between(r, 4, 12)} 600 ${y})"/>
      ${Array.from({ length: 18 }, () => `<circle cx="${560 + between(r, -60, 60)}" cy="${y - between(r, 0, 220)}" r="${between(r, 6, 18)}" fill="#7dd3fc" opacity="0.8"/>`).join('')}`;
  },
  'street-light': (r) => {
    const x = between(r, 350, 800);
    return `${sky(r, true)}${buildings(r, true)}${road(r)}
      <rect x="${x}" y="150" width="22" height="560" fill="#334155"/>
      <path d="M ${x + 11} 160 q 120 -40 160 20" stroke="#334155" stroke-width="16" fill="none"/>
      <rect x="${x + 140}" y="170" width="70" height="26" rx="6" fill="#475569"/>
      <circle cx="${x + 175}" cy="205" r="14" fill="#1f2937" stroke="#6b7280" stroke-width="3"/>`;
  },
  'illegal-dumping': (r) => {
    const cx = between(r, 400, 800);
    return `${sky(r)}${buildings(r)}${ground(r)}
      <path d="M ${cx - 330} 800 Q ${cx} ${between(r, 470, 540)} ${cx + 330} 800 Z" fill="#78716c"/>
      ${debris(r, 60, cx, 700, 280, ['#a16207', '#57534e', '#d6d3d1', '#991b1b', '#1e293b', '#fbbf24'])}`;
  },
  'tree-fallen': (r) => {
    const angle = between(r, -18, -6);
    return `${sky(r)}${buildings(r)}${road(r)}
      <g transform="rotate(${angle} 600 700)">
        <rect x="120" y="660" width="760" height="70" rx="30" fill="#78350f"/>
        ${Array.from({ length: 16 }, () => `<circle cx="${between(r, 750, 1100)}" cy="${between(r, 560, 760)}" r="${between(r, 50, 110)}" fill="${pick(r, ['#15803d', '#166534', '#22c55e', '#4d7c0f'])}"/>`).join('')}
      </g>`;
  },
  'damaged-footpath': (r) => {
    let tiles = '';
    for (let y = 520; y < H; y += 70) {
      for (let x = 0; x < W; x += 110) {
        const broken = r() > 0.82;
        tiles += `<rect x="${x + 3}" y="${y + 3}" width="104" height="64" fill="${broken ? '#57534e' : pick(r, ['#d6d3d1', '#e7e5e4', '#fca5a5'])}" transform="rotate(${broken ? between(r, -14, 14) : 0} ${x + 50} ${y + 30})"/>`;
      }
    }
    return `${sky(r)}${buildings(r)}<rect y="470" width="${W}" height="${H - 470}" fill="#44403c"/>${tiles}`;
  },
  'traffic-signal': (r) => {
    const x = between(r, 400, 750);
    const lit = Math.floor(between(r, 0, 3));
    return `${sky(r)}${buildings(r)}${road(r)}
      <rect x="${x + 50}" y="420" width="24" height="320" fill="#1f2937"/>
      <rect x="${x}" y="150" width="124" height="290" rx="22" fill="#111827"/>
      ${['#ef4444', '#f59e0b', '#22c55e'].map((c, i) => `<circle cx="${x + 62}" cy="${205 + i * 88}" r="34" fill="${i === lit ? '#374151' : '#1f2937'}" stroke="${c}" stroke-width="4" opacity="0.6"/>`).join('')}`;
  },
  others: (r) => `${sky(r)}${buildings(r)}${ground(r)}
      ${debris(r, 12, between(r, 300, 900), 680, 300, ['#f43f5e', '#8b5cf6', '#14b8a6', '#f59e0b'])}`,
};

/** Renders a JPEG "photo" for the given category. */
export async function seedPhoto(category: string, r: Rand): Promise<Buffer> {
  const scene = (scenes[category] ?? scenes.others!)(r);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${scene}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
}

/** Same scene, re-shot: slight crop, brightness and rotation changes (for seeded duplicates). */
export async function reshoot(photo: Buffer, r: Rand): Promise<Buffer> {
  const dx = Math.round(between(r, 10, 60));
  const dy = Math.round(between(r, 10, 40));
  return sharp(photo)
    .extract({ left: dx, top: dy, width: W - dx * 2, height: H - dy * 2 })
    .modulate({ brightness: between(r, 0.9, 1.1) })
    .rotate(between(r, -2, 2), { background: '#000' })
    .resize(W, H, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** The same street after the work crew has been: a clean scene for work-completion photos. */
export async function fixedPhoto(category: string, r: Rand): Promise<Buffer> {
  const paved = ['road-pothole', 'broken-drain', 'tree-fallen', 'traffic-signal', 'street-light'].includes(
    category,
  );
  const night = category === 'street-light';
  let extra = '';
  if (category === 'street-light') {
    const x = between(r, 350, 800);
    extra = `<rect x="${x}" y="150" width="22" height="560" fill="#334155"/>
      <rect x="${x + 140}" y="170" width="70" height="26" rx="6" fill="#475569"/>
      <circle cx="${x + 175}" cy="205" r="16" fill="#fde047"/>
      <circle cx="${x + 175}" cy="205" r="120" fill="#fde047" opacity="0.18"/>`;
  } else if (category === 'traffic-signal') {
    const x = between(r, 400, 750);
    extra = `<rect x="${x + 50}" y="420" width="24" height="320" fill="#1f2937"/>
      <rect x="${x}" y="150" width="124" height="290" rx="22" fill="#111827"/>
      <circle cx="${x + 62}" cy="381" r="34" fill="#22c55e"/>`;
  } else if (category === 'garbage') {
    const x = between(r, 300, 700);
    extra = `<rect x="${x}" y="470" width="190" height="240" rx="14" fill="#15803d"/>
      <rect x="${x - 12}" y="452" width="214" height="34" rx="8" fill="#166534"/>`;
  } else if (category === 'road-pothole') {
    extra = `<ellipse cx="${between(r, 400, 800)}" cy="${between(r, 640, 760)}" rx="190" ry="70" fill="#27272a" opacity="0.35"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${sky(r, night)}${buildings(r, night)}${paved ? road(r) : ground(r)}${extra}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
}
