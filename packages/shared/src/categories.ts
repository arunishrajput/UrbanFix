import type { Priority } from './enums';

export interface CategoryDefinition {
  slug: string;
  name: string;
  /** lucide-react icon name, rendered by the web app. */
  icon: string;
  color: string;
  description: string;
  defaultPriority: Priority;
  /** Target time to resolve, used for SLA tracking. */
  slaHours: number;
  /** Base radius (metres) inside which another open report of this category is a likely duplicate. */
  duplicateRadiusM: number;
  /** Categories that often describe the same physical problem. */
  relatedSlugs: string[];
  /** Words (English + common Hindi/Hinglish) used by the offline category heuristic. */
  keywords: string[];
}

/**
 * The default category catalogue. Seeded into the database; admins can edit
 * names, colours, SLAs and radii later. Slugs are stable identifiers.
 */
export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  {
    slug: 'garbage',
    name: 'Garbage',
    icon: 'Trash2',
    color: '#16a34a',
    description: 'Overflowing bins, uncollected waste, littered streets.',
    defaultPriority: 'MEDIUM',
    slaHours: 48,
    duplicateRadiusM: 50,
    relatedSlugs: ['illegal-dumping'],
    keywords: [
      'garbage',
      'trash',
      'waste',
      'litter',
      'bin',
      'dustbin',
      'rubbish',
      'kachra',
      'kooda',
      'kuda',
      'smell',
    ],
  },
  {
    slug: 'road-pothole',
    name: 'Road Pothole',
    icon: 'Construction',
    color: '#ea580c',
    description: 'Potholes, cracks and broken road surfaces.',
    defaultPriority: 'HIGH',
    slaHours: 72,
    duplicateRadiusM: 30,
    relatedSlugs: ['damaged-footpath'],
    keywords: ['pothole', 'road', 'crack', 'asphalt', 'tar', 'gaddha', 'khadda', 'speed breaker', 'bump'],
  },
  {
    slug: 'broken-drain',
    name: 'Broken Drain',
    icon: 'Waves',
    color: '#0891b2',
    description: 'Blocked, open or overflowing drains and manholes.',
    defaultPriority: 'HIGH',
    slaHours: 48,
    duplicateRadiusM: 40,
    relatedSlugs: ['water-leakage', 'broken-pipeline'],
    keywords: ['drain', 'gutter', 'sewage', 'manhole', 'nala', 'naali', 'nali', 'clog', 'overflow', 'sewer'],
  },
  {
    slug: 'water-leakage',
    name: 'Water Leakage',
    icon: 'Droplets',
    color: '#2563eb',
    description: 'Leaking taps, valves or water lines wasting water.',
    defaultPriority: 'HIGH',
    slaHours: 24,
    duplicateRadiusM: 40,
    relatedSlugs: ['broken-pipeline', 'broken-drain'],
    keywords: ['leak', 'leakage', 'water', 'tap', 'valve', 'paani', 'pani', 'wastage', 'flooding'],
  },
  {
    slug: 'broken-pipeline',
    name: 'Broken Pipeline',
    icon: 'Pipette',
    color: '#4f46e5',
    description: 'Burst or damaged water / sewage pipelines.',
    defaultPriority: 'CRITICAL',
    slaHours: 24,
    duplicateRadiusM: 50,
    relatedSlugs: ['water-leakage', 'broken-drain'],
    keywords: ['pipeline', 'pipe', 'burst', 'main line', 'supply line'],
  },
  {
    slug: 'street-light',
    name: 'Street Light',
    icon: 'Lightbulb',
    color: '#ca8a04',
    description: 'Street lights that are off, flickering or damaged.',
    defaultPriority: 'MEDIUM',
    slaHours: 72,
    duplicateRadiusM: 35,
    relatedSlugs: [],
    keywords: ['street light', 'streetlight', 'lamp', 'light', 'bulb', 'dark', 'batti', 'pole'],
  },
  {
    slug: 'illegal-dumping',
    name: 'Illegal Dumping',
    icon: 'PackageX',
    color: '#9333ea',
    description: 'Construction debris or waste dumped in public spaces.',
    defaultPriority: 'MEDIUM',
    slaHours: 96,
    duplicateRadiusM: 60,
    relatedSlugs: ['garbage'],
    keywords: ['dumping', 'dumped', 'debris', 'rubble', 'malba', 'construction waste', 'mattress'],
  },
  {
    slug: 'tree-fallen',
    name: 'Tree Fallen',
    icon: 'TreeDeciduous',
    color: '#15803d',
    description: 'Fallen trees or dangerous hanging branches.',
    defaultPriority: 'CRITICAL',
    slaHours: 12,
    duplicateRadiusM: 60,
    relatedSlugs: [],
    keywords: ['tree', 'branch', 'fallen', 'uprooted', 'ped', 'trunk', 'storm'],
  },
  {
    slug: 'damaged-footpath',
    name: 'Damaged Footpath',
    icon: 'Footprints',
    color: '#78716c',
    description: 'Broken paver blocks, missing slabs, encroached footpaths.',
    defaultPriority: 'MEDIUM',
    slaHours: 120,
    duplicateRadiusM: 30,
    relatedSlugs: ['road-pothole'],
    keywords: ['footpath', 'sidewalk', 'pavement', 'paver', 'slab', 'tiles', 'walkway', 'kerb'],
  },
  {
    slug: 'traffic-signal',
    name: 'Traffic Signal',
    icon: 'TrafficCone',
    color: '#dc2626',
    description: 'Signals not working, wrongly timed or damaged.',
    defaultPriority: 'HIGH',
    slaHours: 24,
    duplicateRadiusM: 40,
    relatedSlugs: [],
    keywords: ['signal', 'traffic light', 'junction', 'blinking', 'red light', 'crossing'],
  },
  {
    slug: 'others',
    name: 'Others',
    icon: 'CircleHelp',
    color: '#64748b',
    description: 'Anything else that needs the corporation’s attention.',
    defaultPriority: 'LOW',
    slaHours: 168,
    duplicateRadiusM: 30,
    relatedSlugs: [],
    keywords: [],
  },
];

export const FALLBACK_CATEGORY_SLUG = 'others';
