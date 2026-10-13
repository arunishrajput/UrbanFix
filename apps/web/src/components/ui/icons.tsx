/**
 * Icons referenced by name from data (categories, badges). An explicit map keeps
 * the bundle small instead of importing every lucide icon.
 */
import {
  BadgeCheck,
  CircleHelp,
  Construction,
  Droplets,
  Eye,
  Flag,
  Footprints,
  Lightbulb,
  PackageX,
  Pipette,
  ShieldCheck,
  Sprout,
  TrafficCone,
  Trash2,
  TreeDeciduous,
  Trophy,
  Users,
  Waves,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
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
  Flag,
  Sprout,
  ShieldCheck,
  Users,
  BadgeCheck,
  Eye,
  Trophy,
};

export const iconFor = (name: string | undefined): LucideIcon => (name && ICONS[name]) || CircleHelp;
export const ICON_NAMES = Object.keys(ICONS);
