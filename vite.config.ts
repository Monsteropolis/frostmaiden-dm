import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        tv: 'tv.html',       // Player TV View — second entry, same deploy
      },
    },
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/star.svg'],
      manifest: {
        name: 'Frostmaiden DM Companion',
        short_name: 'Frostmaiden',
        description: 'DM companion for Rime of the Frostmaiden',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0D0E22',
        theme_color: '#0D0E22',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // D&D 5e API — cache-first so the compendium works offline after first load
            urlPattern: /^https:\/\/www\.dnd5eapi\.co\/api\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dnd5e-api',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
