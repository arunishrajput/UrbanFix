/**
 * Image pipeline for uploads: validate, read EXIF GPS, auto-orient, strip
 * metadata, produce WebP variants, and compute a thumbhash placeholder,
 * a SHA-256 (exact duplicates) and a 64-bit DCT perceptual hash (near duplicates).
 */
import exifr from 'exifr';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import { badRequest } from '../core/errors';
import { sha256 } from '../core/auth';

export const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const VARIANTS = {
  thumb: { size: 320, quality: 70 },
  medium: { size: 960, quality: 78 },
  full: { size: 2048, quality: 82 },
} as const;
export type VariantName = keyof typeof VARIANTS;

export interface ProcessedImage {
  variants: Record<VariantName, Buffer>;
  width: number;
  height: number;
  thumbhash: string;
  sha256: string;
  phash: string;
  exif: { lat: number; lng: number } | null;
}

export async function detectImageType(buffer: Buffer): Promise<string> {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ACCEPTED_MIME.has(type.mime)) {
    throw badRequest('Unsupported image. Upload a JPEG, PNG, WebP or AVIF photo.');
  }
  return type.mime;
}

async function readGps(buffer: Buffer): Promise<{ lat: number; lng: number } | null> {
  try {
    const gps = await exifr.gps(buffer);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      if (
        Math.abs(gps.latitude) <= 90 &&
        Math.abs(gps.longitude) <= 180 &&
        !(gps.latitude === 0 && gps.longitude === 0)
      ) {
        return { lat: gps.latitude, lng: gps.longitude };
      }
    }
  } catch {
    // no / unreadable EXIF
  }
  return null;
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  await detectImageType(input);
  const exif = await readGps(input);

  // `.rotate()` with no arguments applies the EXIF orientation; output drops all metadata (EXIF, GPS).
  const base = sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
  try {
    await base.metadata();
  } catch {
    throw badRequest('That file could not be read as an image.');
  }

  const entries = await Promise.all(
    (Object.keys(VARIANTS) as VariantName[]).map(async (name) => {
      const { size, quality } = VARIANTS[name];
      const out = await base
        .clone()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      return [name, out] as const;
    }),
  );
  const variants = Object.fromEntries(entries.map(([n, o]) => [n, o.data])) as Record<VariantName, Buffer>;
  const fullInfo = entries.find(([n]) => n === 'full')![1].info;

  const small = await base
    .clone()
    .resize(100, 100, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const thumbhash = Buffer.from(rgbaToThumbHash(small.info.width, small.info.height, small.data)).toString(
    'base64',
  );

  return {
    variants,
    width: fullInfo.width,
    height: fullInfo.height,
    thumbhash,
    sha256: sha256(input),
    phash: await perceptualHash(input),
    exif,
  };
}

/* ---------- perceptual hash ---------- */

const N = 32;
const K = 8;
const COS: number[][] = Array.from({ length: K }, (_, k) =>
  Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
);

/**
 * pHash: 32×32 grayscale → 2-D DCT → top-left 8×8 low frequencies → bit = coefficient > median.
 * Robust to resizing, recompression and small colour changes.
 */
export async function perceptualHash(input: Buffer): Promise<string> {
  const { data } = await sharp(input)
    .rotate()
    .grayscale()
    .resize(N, N, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Row transform: rows[y][k] for k < K.
  const rows: number[][] = [];
  for (let y = 0; y < N; y++) {
    const row: number[] = [];
    for (let k = 0; k < K; k++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += data[y * N + x]! * COS[k]![x]!;
      row.push(s);
    }
    rows.push(row);
  }
  // Column transform on the first K coefficients.
  const coeffs: number[] = [];
  for (let k1 = 0; k1 < K; k1++) {
    for (let k2 = 0; k2 < K; k2++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += rows[y]![k2]! * COS[k1]![y]!;
      coeffs.push(s);
    }
  }
  const ac = coeffs.slice(1); // skip the DC term (overall brightness)
  const sorted = [...ac].sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (coeffs[i + b]! > median ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}
