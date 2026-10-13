import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hammingHex } from '@urbanfix/shared';
import { perceptualHash, processImage } from '../../src/lib/images';
import { reshoot, seedPhoto } from '../../src/db/seed-images';

const rng = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

describe('perceptual hash', () => {
  it('survives resizing and recompression', async () => {
    const img = await seedPhoto('road-pothole', rng(1));
    const smaller = await sharp(img).resize(400).jpeg({ quality: 50 }).toBuffer();
    expect(hammingHex(await perceptualHash(img), await perceptualHash(smaller))).toBeLessThanOrEqual(4);
  });

  it('stays close for a re-shot photo of the same scene', async () => {
    const img = await seedPhoto('garbage', rng(2));
    const again = await reshoot(img, rng(3));
    expect(hammingHex(await perceptualHash(img), await perceptualHash(again))).toBeLessThanOrEqual(12);
  });

  it('differs for different scenes', async () => {
    const a = await seedPhoto('garbage', rng(4));
    const b = await seedPhoto('street-light', rng(5));
    expect(hammingHex(await perceptualHash(a), await perceptualHash(b))).toBeGreaterThan(18);
  });
});

describe('processImage', () => {
  it('produces webp variants, strips metadata and keeps EXIF GPS', async () => {
    const base = await seedPhoto('garbage', rng(6));
    const withExif = await sharp(base)
      .withExif({
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '18/1 31/1 1200/100',
          GPSLongitudeRef: 'E',
          GPSLongitude: '73/1 51/1 2400/100',
        },
      })
      .jpeg()
      .toBuffer();
    const out = await processImage(withExif);
    expect(out.width).toBeLessThanOrEqual(2048);
    expect(out.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(out.sha256).toHaveLength(64);
    const meta = await sharp(out.variants.full).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    if (out.exif) {
      expect(out.exif.lat).toBeCloseTo(18.52, 1);
      expect(out.exif.lng).toBeCloseTo(73.86, 1);
    }
  });

  it('rejects non-images', async () => {
    await expect(processImage(Buffer.from('hello world'))).rejects.toThrow(/Unsupported image/);
  });
});
