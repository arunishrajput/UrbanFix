import { Camera, ImagePlus, LoaderCircle, Sparkles, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { toast } from 'sonner';
import type { UploadDTO } from '@urbanfix/shared';
import { ApiError } from '../../../lib/api';
import { ensureSession } from '../../../lib/auth';
import { useCategoryMap } from '../../../lib/reference';
import { useReportDraft } from '../store';
import { uploadPhoto } from '../uploads';

const MAX_PHOTOS = 4;

export function PhotoStep({ uploads }: { uploads: Map<string, UploadDTO | undefined> }) {
  const { photos, addPhoto, updatePhoto, removePhoto } = useReportDraft();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const categories = useCategoryMap();

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      await ensureSession();
    } catch {
      toast.error('Could not start a session. Check your connection.');
      return;
    }
    const room = MAX_PHOTOS - useReportDraft.getState().photos.length;
    for (const file of files.slice(0, room)) {
      const key = crypto.randomUUID();
      addPhoto({ key, previewUrl: URL.createObjectURL(file), uploadId: null, status: 'uploading' });
      uploadPhoto(file)
        .then((u) => updatePhoto(key, { uploadId: u.id, status: 'ready' }))
        .catch((err) =>
          updatePhoto(key, {
            status: 'error',
            error: err instanceof ApiError ? err.message : 'Upload failed',
          }),
        );
    }
    if (files.length > room) toast.message(`Only ${MAX_PHOTOS} photos per report`);
  };

  // Copy the FileList before clearing the input (clearing empties the live list).
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void onFiles(files);
  };

  return (
    <div>
      <h2 className="text-2xl font-black">Take a photo of the problem</h2>
      <p className="mt-1 text-sm text-muted">
        One clear photo is enough. Add up to {MAX_PHOTOS} if it helps the crew find it.
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pick}
      />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} />

      {photos.length === 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => cameraRef.current?.click()}
            className="asphalt group relative flex aspect-[4/3] flex-col items-center justify-center gap-3 overflow-hidden rounded-[1.75rem] sm:aspect-auto sm:h-64"
          >
            <span className="grid size-20 place-items-center rounded-full bg-lane text-lane-ink transition-transform group-hover:scale-105">
              <Camera className="size-9" strokeWidth={2.2} />
            </span>
            <span className="font-display text-lg font-extrabold">Open camera</span>
            <span className="lane-line-h lane-moving absolute bottom-6 left-0 right-0 h-1 opacity-70" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => galleryRef.current?.click()}
            className="flex items-center justify-center gap-3 rounded-[1.75rem] border-2 border-dashed border-line p-6 font-display font-bold text-muted hover:border-signal hover:text-signal sm:h-64 sm:flex-col"
          >
            <ImagePlus className="size-7" /> Choose from gallery
          </motion.button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AnimatePresence>
            {photos.map((p) => {
              const u = p.uploadId ? uploads.get(p.uploadId) : undefined;
              const a = u?.analysis;
              const cat = a?.categorySlug ? categories.get(a.categorySlug) : undefined;
              const warn = a && a.source === 'gemini' && (!a.isCivicIssue || !a.moderation.safe);
              return (
                <motion.figure
                  key={p.key}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2"
                >
                  <img src={p.previewUrl} alt="Your photo" className="size-full object-cover" />
                  <button
                    onClick={() => removePhoto(p.key)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                    aria-label="Remove photo"
                  >
                    <X className="size-4" />
                  </button>
                  <figcaption className="absolute inset-x-2 bottom-2">
                    {p.status === 'uploading' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white">
                        <LoaderCircle className="size-3.5 animate-spin" /> Uploading
                      </span>
                    )}
                    {p.status === 'error' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-cone px-2.5 py-1 text-xs font-semibold text-white">
                        <TriangleAlert className="size-3.5" /> {p.error}
                      </span>
                    )}
                    {p.status === 'ready' && u?.analysisStatus === 'PENDING' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white">
                        <Sparkles className="size-3.5 animate-pulse text-lane" /> Analysing
                      </span>
                    )}
                    {p.status === 'ready' && cat && a?.source === 'gemini' && (
                      <motion.span
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-lane px-2.5 py-1 text-xs font-bold text-lane-ink"
                      >
                        <Sparkles className="size-3.5 shrink-0" />
                        <span className="truncate">Looks like {cat.name}</span>
                      </motion.span>
                    )}
                  </figcaption>
                  {warn && (
                    <div className="absolute inset-x-0 top-0 bg-cone/90 px-2 py-1 text-[0.7rem] font-semibold text-white">
                      {a!.moderation.safe
                        ? 'This may not show a civic issue'
                        : 'This photo may be removed by moderators'}
                    </div>
                  )}
                </motion.figure>
              );
            })}
          </AnimatePresence>
          {photos.length < MAX_PHOTOS && (
            <div className="grid aspect-square grid-rows-2 gap-2">
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-2xl bg-surface-2 text-sm font-bold hover:bg-line"
              >
                <Camera className="size-4" /> Camera
              </button>
              <button
                onClick={() => galleryRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-2xl bg-surface-2 text-sm font-bold hover:bg-line"
              >
                <ImagePlus className="size-4" /> Gallery
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
