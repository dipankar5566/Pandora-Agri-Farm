import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.spec.ts'], hookTimeout: 60000, testTimeout: 30000, fileParallelism: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
