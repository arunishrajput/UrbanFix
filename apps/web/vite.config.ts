import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_TARGET ?? 'http://localhost:4000';
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        // Precache the app shell and the Latin font subsets; other subsets load on demand.
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg}', '**/*-latin-wght-normal-*.woff2'] },
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'UrbanFix — report civic issues',
          short_name: 'UrbanFix',
          description:
            'Report civic issues to your municipal corporation and follow them until they are fixed.',
          theme_color: '#0b6e4f',
          background_color: '#eef0ec',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': apiTarget,
        '/uploads': apiTarget,
        '/socket.io': { target: apiTarget, ws: true },
      },
    },
    preview: { port: 4173 },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/](leaflet|react-leaflet|supercluster|leaflet\.heat)[\\/]/.test(id)) return 'map';
            if (/[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) return 'charts';
            if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
