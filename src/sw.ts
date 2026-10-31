/// <reference lib="webworker" />
import { addPlugins, cleanupOutdatedCaches, matchPrecache, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import type { WorkboxPlugin } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

/**
 * Makes the page "cross-origin isolated" (COOP + COEP headers), which lets the processor ("Compatible")
 * AI mode use several CPU cores instead of one. GitHub Pages can't send these headers, so the
 * service worker adds them to the pages and scripts it serves. The first visit, before this worker
 * is installed, simply runs on one core.
 * COEP "credentialless" still allows the one-time model download from other sites (sent without cookies).
 */
function isolate(response: Response): Response {
  if (response.type === 'opaque' || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const isolatePlugin: WorkboxPlugin = {
  handlerWillRespond: async ({ response }) => isolate(response),
};

// App shell, precached at install so Confi opens offline.
addPlugins([isolatePlugin]);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Any page address in scope (e.g. "/?mockai", "/#/setup" reloads) gets the app shell.
registerRoute(
  new NavigationRoute(async ({ request }) => isolate((await matchPrecache('index.html')) ?? (await fetch(request))), {
    // The blog is plain pages, not part of the app.
    denylist: [/^\/blog\//, /^\/en\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
  }),
);

// The AI and spelling engines (large scripts, WebAssembly, dictionaries) are cached the first time they're used.
registerRoute(
  ({ url }) => url.origin === self.location.origin && (/\/assets\/.+\.(js|wasm|mjs|aff|dic)$/.test(url.pathname) || url.pathname.includes('/grammalecte-')),
  new CacheFirst({ cacheName: 'ai-engines', plugins: [isolatePlugin] }),
);

// "A new version is available → Refresh": the page asks the waiting worker to take over.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
