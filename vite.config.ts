import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: https://konecnymobil.github.io/prvnacek/
const base = '/prvnacek/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registrace v src/main.tsx (virtual:pwa-register)
      includeAssets: ['icons/*.png', 'licenses/*.txt'],
      manifest: {
        id: base,
        name: 'Prvňáček',
        short_name: 'Prvňáček',
        description: 'Čtení pro prvňáčky: písmenka, slabiky, slova.',
        lang: 'cs',
        start_url: base,
        scope: base,
        // iOS manifest „fullscreen“ nepodporuje; standalone + black-translucent v index.html = celá plocha
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFF6E5',
        theme_color: '#FFF6E5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Offline: aplikace, písmo, obsah (JSON) i všechny zvuky (mp3) jsou v precache.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,mp3,txt,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
});
