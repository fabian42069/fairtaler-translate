import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  // The app builds copy the whole site into these folders; watching them
  // makes the dev server reload (or crash on locked files) during a build.
  server: { watch: { ignored: ['**/mobile/**', '**/desktop/**', '**/release/**', '**/dist/**', '**/.tools/**', '**/.cache/**'] } },
});
