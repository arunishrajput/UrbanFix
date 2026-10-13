import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { useAuth } from '../lib/auth';
import { queryClient } from '../lib/query';
import { router } from './router';

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
        <Toaster
          position="top-center"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                '!rounded-2xl !border-line !bg-surface !text-ink !font-sans !shadow-[var(--shadow-float)]',
              description: '!text-muted',
              actionButton: '!bg-signal !text-white !font-display !font-bold !rounded-lg',
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
