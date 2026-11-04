import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';

// HTTPS is required for WebXR on the Quest browser (except on localhost).
// host: true exposes the dev server on the LAN so the headset can reach it.
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  server: { host: true, https: true },
  preview: { host: true, https: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        desktop: resolve(__dirname, 'desktop.html'),
        vr: resolve(__dirname, 'vr.html'),
      },
    },
  },
});
