import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { cn } from '../../lib/cn';

/**
 * Bottom sheet on phones, centred panel on larger screens. Drag the handle
 * down (or press Esc / tap outside) to dismiss.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  const drag = useDragControls();
  return (
    <RD.Root open={open} onOpenChange={(o) => (dismissible || o) && onOpenChange(o)}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[1000] bg-black/45 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </RD.Overlay>
            <RD.Content asChild forceMount onPointerDownOutside={(e) => !dismissible && e.preventDefault()}>
              <motion.div
                className={cn(
                  'fixed inset-x-0 bottom-0 z-[1001] flex max-h-[92dvh] flex-col rounded-t-[1.75rem] bg-surface shadow-[var(--shadow-float)] outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem]',
                  className,
                )}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 340 }}
                drag={dismissible ? 'y' : false}
                dragListener={false}
                dragControls={drag}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false);
                }}
              >
                <div
                  className="flex cursor-grab touch-none justify-center pb-1 pt-3 sm:hidden"
                  onPointerDown={(e) => dismissible && drag.start(e)}
                >
                  <span className="h-1.5 w-12 rounded-full bg-line" />
                </div>
                <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-2 sm:pt-5">
                  <div>
                    <RD.Title className="font-display text-xl font-extrabold leading-tight">{title}</RD.Title>
                    {description ? (
                      <RD.Description className="mt-1 text-sm text-muted">{description}</RD.Description>
                    ) : (
                      <RD.Description className="sr-only">{title}</RD.Description>
                    )}
                  </div>
                  {dismissible && (
                    <RD.Close
                      className="-mr-1 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink"
                      aria-label="Close"
                    >
                      <X className="size-5" />
                    </RD.Close>
                  )}
                </div>
                <div className="overflow-y-auto overscroll-contain px-5 pb-6 pb-safe">{children}</div>
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}
