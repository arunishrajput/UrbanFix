/**
 * Production build: bundles each entrypoint into dist/ with esbuild. The
 * workspace package @urbanfix/shared is inlined (it ships TypeScript source);
 * npm dependencies stay external and are installed in the runtime image.
 */
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });

const externalNpm = {
  name: 'external-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@urbanfix/')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await build({
  entryPoints: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    migrate: 'src/db/migrate-cli.ts',
    seed: 'src/db/seed.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  plugins: [externalNpm],
  logLevel: 'info',
});
