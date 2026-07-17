import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Bundle contracts from source: rollup can't statically resolve named
      // exports through the package's CJS dist (__exportStar), and the api
      // workspace still needs that CJS build.
      '@pandora/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    proxy: { '/api': 'http://localhost:3300' },
  },
});
