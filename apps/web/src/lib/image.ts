/**
 * Client-side photo preparation: decode (including iPhone HEIC where the
 * browser supports it), downscale to 2048 px and re-encode as JPEG. This keeps
 * uploads small on mobile data and normalises formats the server can't read.
 */
const MAX = 2048;

export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // let the server validate it
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  return blob && blob.size < file.size * 1.2 ? blob : file;
}
