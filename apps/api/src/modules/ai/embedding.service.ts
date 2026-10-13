import { embed } from './gemini.client';

/**
 * Multimodal image embedding used for duplicate-photo detection.
 * (Text similarity uses pg_trgm over descriptions and AI captions, so a
 * duplicate check never waits on an extra AI round-trip.)
 */
export function embedImage(image: Buffer, mimeType: string): Promise<number[]> {
  return embed([{ inline_data: { mime_type: mimeType, data: image.toString('base64') } }]);
}
