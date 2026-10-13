import * as RD from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { PhotoDTO } from '@urbanfix/shared';

export function Lightbox({
  photos,
  index,
  onClose,
}: {
  photos: PhotoDTO[];
  index: number | null;
  onClose: () => void;
}) {
  const [i, setI] = useState(index ?? 0);
  const [openedAt, setOpenedAt] = useState(index);
  if (index !== openedAt) {
    setOpenedAt(index);
    if (index != null) setI(index);
  }
  const open = index != null && photos.length > 0;
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  const photo = photos[i];

  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-[1100] bg-black/90" />
        <RD.Content
          className="fixed inset-0 z-[1101] flex items-center justify-center outline-none"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(1);
            if (e.key === 'ArrowLeft') go(-1);
          }}
        >
          <RD.Title className="sr-only">
            Photo {i + 1} of {photos.length}
          </RD.Title>
          <RD.Description className="sr-only">{photo?.caption ?? 'Issue photo'}</RD.Description>
          <AnimatePresence mode="wait">
            {photo && (
              <motion.img
                key={photo.id}
                src={photo.fullUrl}
                alt={photo.caption ?? 'Issue photo'}
                className="max-h-[88dvh] max-w-[94vw] rounded-xl object-contain"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                drag={photos.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -80) go(1);
                  else if (info.offset.x > 80) go(-1);
                }}
              />
            )}
          </AnimatePresence>
          <RD.Close
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            aria-label="Close photo"
          >
            <X className="size-5" />
          </RD.Close>
          {photos.length > 1 && (
            <>
              <button
                onClick={() => go(-1)}
                className="absolute left-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                onClick={() => go(1)}
                className="absolute right-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Next photo"
              >
                <ChevronRight className="size-5" />
              </button>
              <span className="absolute bottom-5 font-mono text-sm text-white/80">
                {i + 1} / {photos.length}
              </span>
            </>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
