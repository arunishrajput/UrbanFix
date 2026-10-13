import { thumbHashToDataURL } from 'thumbhash';

const cache = new Map<string, string>();

/** Decodes a base64 thumbhash into a tiny blurred data URL used as an image placeholder. */
export function thumbhashUrl(hash: string | null | undefined): string | undefined {
  if (!hash) return undefined;
  let url = cache.get(hash);
  if (!url) {
    try {
      const bytes = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0));
      url = thumbHashToDataURL(bytes);
      cache.set(hash, url);
    } catch {
      return undefined;
    }
  }
  return url;
}
