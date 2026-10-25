import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Shown in the footer so we can tell which version someone is running.
const version = `${pkg.version}${process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : '-dev'}`;

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/browser-extension/").
const base = process.env.BASE_PATH ?? '/';
// The public address, for canonical and social-preview links (they must be absolute).
const siteUrl = process.env.SITE_URL ?? `https://cessalan.github.io${base}`;

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl) },
    preact(),
    tailwindcss(),
    VitePWA({
      // Ask before updating: an automatic reload would wipe an unsaved draft.
      registerType: 'prompt',
      manifest: {
        name: 'Confi',
        short_name: 'Confi',
        description: 'Private, on-device writing assistant for confidential text: emails, notes and reports.',
        theme_color: '#ffffff',
        background_color: '#f0f9ff',
        display: 'standalone',
        lang: 'en',
        categories: ['productivity', 'business', 'utilities'],
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
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
