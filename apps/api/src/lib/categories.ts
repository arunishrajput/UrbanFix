import { asc } from 'drizzle-orm';
import type { CategoryDTO } from '@urbanfix/shared';
import { db, schema } from '../db/client';

let cache: { at: number; rows: CategoryDTO[] } | null = null;
const TTL_MS = 30_000;

/** All categories (active and inactive), cached briefly in-process. */
export async function getCategories(): Promise<CategoryDTO[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await db
    .select()
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  const dtos: CategoryDTO[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    icon: r.icon,
    color: r.color,
    description: r.description,
    defaultPriority: r.defaultPriority,
    slaHours: r.slaHours,
    duplicateRadiusM: r.duplicateRadiusM,
    relatedSlugs: r.relatedSlugs,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
  }));
  cache = { at: Date.now(), rows: dtos };
  return dtos;
}

export function invalidateCategories() {
  cache = null;
}

export async function categoryBySlug(slug: string) {
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

export async function categoryById(id: string) {
  return (await getCategories()).find((c) => c.id === id) ?? null;
}
