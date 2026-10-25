import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Shown in the footer so we can tell which version someone is running.
const version = `${pkg.version}${process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : '-dev'}`;

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/browser-extension/").
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      // Ask before updating: an automatic reload would wipe an unsaved draft.
      registerType: 'prompt',
      manifest: {
        name: 'Liaison Assistant',
        short_name: 'Liaison',
        description: 'Private, on-device assistant for liaison nurses.',
        theme_color: '#0f2a4a',
        background_color: '#f5f7fb',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        // Precache the small app shell. The AI engines (large) are cached the first time they're used.
        // Model weights are cached separately by the AI libraries themselves.
        globPatterns: ['**/*.{css,html,svg}', 'assets/index-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\/assets\/.+\.(js|wasm|mjs)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'ai-engines' },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});
