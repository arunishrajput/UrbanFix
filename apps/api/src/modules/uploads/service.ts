import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { MUNICIPAL_ROLES, type PhotoKind, type UploadDTO } from '@urbanfix/shared';
import { config } from '../../config';
import type { AuthContext } from '../../core/auth';
import { forbidden, notFound } from '../../core/errors';
import { enqueue } from '../../core/jobs';
import { storage } from '../../core/storage';
import { db, schema } from '../../db/client';
import { processImage } from '../../lib/images';
import { toUploadDTO } from '../../lib/photos';

const { photos } = schema;

export async function createUpload(auth: AuthContext, buffer: Buffer, kind: PhotoKind): Promise<UploadDTO> {
  if (kind === 'WORK_COMPLETION' && !MUNICIPAL_ROLES.includes(auth.role)) {
    throw forbidden('Only municipal staff can upload work-completion photos');
  }
  const image = await processImage(buffer);
  const id = randomUUID();
  const now = new Date();
  const prefix = `photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
  const variants = {
    thumb: `${prefix}/thumb.webp`,
    medium: `${prefix}/medium.webp`,
    full: `${prefix}/full.webp`,
  };
  await Promise.all([
    storage.put(variants.thumb, image.variants.thumb, 'image/webp'),
    storage.put(variants.medium, image.variants.medium, 'image/webp'),
    storage.put(variants.full, image.variants.full, 'image/webp'),
  ]);

  // Citizen photos get AI analysis (category, caption, severity, moderation, embedding).
  const analyze = kind !== 'WORK_COMPLETION';
  const [row] = await db
    .insert(photos)
    .values({
      id,
      uploadedById: auth.id,
      kind,
      status: 'DRAFT',
      variants,
      width: image.width,
      height: image.height,
      bytes: image.variants.full.length,
      thumbhash: image.thumbhash,
      sha256: image.sha256,
      phash: image.phash,
      exifLat: image.exif?.lat,
      exifLng: image.exif?.lng,
      analysisStatus: analyze ? 'PENDING' : 'SKIPPED',
    })
    .returning();

  if (analyze) await enqueue('analyze-photo', { photoId: id }, { jobId: `analyze-${id}` });
  return toUploadDTO(row!);
}

export async function getUpload(auth: AuthContext, id: string): Promise<UploadDTO> {
  const row = await db.query.photos.findFirst({ where: eq(photos.id, id) });
  if (!row) throw notFound('Upload');
  if (row.uploadedById !== auth.id && !MUNICIPAL_ROLES.includes(auth.role)) throw notFound('Upload');
  return toUploadDTO(row);
}

/**
 * Validates that the given uploads belong to the user, are still drafts and
 * have the expected kind. Returns them in the requested order.
 */
export async function claimDraftUploads(
  dbx: Pick<typeof db, 'select'>,
  userId: string,
  ids: string[],
  kind: PhotoKind,
) {
  if (!ids.length) return [];
  const rows = await dbx
    .select()
    .from(photos)
    .where(and(eq(photos.uploadedById, userId), eq(photos.status, 'DRAFT'), eq(photos.kind, kind)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const found = ids.map((id) => byId.get(id));
  if (found.some((r) => !r)) {
    throw forbidden(
      'One or more photos are missing, already used, or belong to someone else. Please re-upload.',
    );
  }
  return found as (typeof rows)[number][];
}

export const maxUploadBytes = () => config.MAX_UPLOAD_MB * 1024 * 1024;
