import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Shown in the footer so we can tell which version someone is running.
const version = `${pkg.version}${process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : '-dev'}`;

// The site is served from the root of its custom domain. Set BASE_PATH only to host it under a sub-path
// (e.g. "/browser-extension/" on cessalan.github.io without a custom domain).
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
        name: 'Confi',
        short_name: 'Confi',
        description: 'Private, on-device writing assistant for confidential text: emails, notes and reports.',
        theme_color: '#ffffff',
        background_color: '#f0f9ff',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      // Our own service worker (src/sw.ts): it also makes the page cross-origin isolated (see the file).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Precache the small app shell. The AI engines (large) are cached the first time they're used.
        // Model weights are cached separately by the AI libraries themselves.
        globPatterns: ['**/*.{css,html,svg,ico}', 'favicon-32.png', 'assets/index-*.js'],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});
