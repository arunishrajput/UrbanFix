import type { PhotoDTO, UploadDTO } from '@urbanfix/shared';
import { storage } from '../core/storage';
import type { schema } from '../db/client';
import { iso, isoOrNow } from './format';

type PhotoRow = typeof schema.photos.$inferSelect;

export function photoUrls(variants: PhotoRow['variants']) {
  return {
    url: storage.url(variants.medium),
    thumbUrl: storage.url(variants.thumb),
    fullUrl: storage.url(variants.full),
  };
}

export function toPhotoDTO(p: PhotoRow): PhotoDTO {
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    ...photoUrls(p.variants),
    width: p.width,
    height: p.height,
    thumbhash: p.thumbhash,
    caption: p.analysis?.caption ?? null,
    createdAt: isoOrNow(p.createdAt),
  };
}

export function toUploadDTO(p: PhotoRow): UploadDTO {
  return {
    ...toPhotoDTO(p),
    analysisStatus: p.analysisStatus,
    analysis: p.analysis ?? null,
    exifLocation: p.exifLat != null && p.exifLng != null ? { lat: p.exifLat, lng: p.exifLng } : null,
  };
}

export { iso };
