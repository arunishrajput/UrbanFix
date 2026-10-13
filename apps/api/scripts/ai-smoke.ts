/**
 * Live smoke test for the Gemini integration: analyses an image and embeds it.
 *   pnpm --filter @urbanfix/api ai:smoke [path/to/photo.jpg]
 * Without a path, a generated sample "garbage" scene is used.
 */
import { readFile } from 'node:fs/promises';
import { config } from '../src/config';
import { seedPhoto } from '../src/db/seed-images';
import { getCategories } from '../src/lib/categories';
import { embedImage } from '../src/modules/ai/embedding.service';
import { analyzeIssuePhoto } from '../src/modules/ai/vision.service';
import { pool } from '../src/db/client';
import { redis } from '../src/core/redis';
import { DEFAULT_CATEGORIES } from '@urbanfix/shared';

async function main() {
  if (!config.aiAvailable) throw new Error('Set GEMINI_API_KEY (and AI_ENABLED=true) first');
  const path = process.argv[2];
  const image = path ? await readFile(path) : await seedPhoto('garbage', Math.random);
  const mime = path?.endsWith('.png') ? 'image/png' : path?.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const categories = await getCategories().catch(() => []);
  const cats = categories.length ? categories : DEFAULT_CATEGORIES;

  let t = Date.now();
  const analysis = await analyzeIssuePhoto(image, mime, cats);
  console.log(`analysis (${Date.now() - t} ms):`, JSON.stringify(analysis, null, 2));
  t = Date.now();
  const embedding = await embedImage(image, mime);
  console.log(
    `embedding (${Date.now() - t} ms): ${embedding.length} dims, first values ${embedding.slice(0, 4).join(', ')}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
