# Confi

Private, on-device writing assistant for anyone who reviews and corrects text containing sensitive data (patients, clients, employees): emails, notes, reports.
All AI runs **in the browser on the user's computer**. No server, nothing is uploaded.

Current stage: **device speed test**. It checks whether a computer can run the local AI models.

## Run it locally

Needs [Node.js](https://nodejs.org) 22+.

```bash
npm install      # once
npm run dev      # open http://localhost:5173
npm test         # unit tests
npm run build    # production build in dist/
```

## Live site

**https://confi.ca** (GitHub Pages, custom domain).

- Deploys automatically on every merge to `main` (`.github/workflows/deploy.yml`).
- Domain: set in **Settings → Pages → Custom domain**. DNS: A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `www` CNAME → `cessalan.github.io`.
- The app is built for the domain root (`/`). Set `BASE_PATH` only to host it under a sub-path.

## Stack

- Vite + TypeScript + Preact + Tailwind, installable PWA
- Text AI: WebLLM (WebGPU), default Gemma 3 1B
- Dictation: transformers.js + Moonshine Tiny (CPU)
- Privacy: Content-Security-Policy in `index.html` only allows model downloads (Hugging Face, GitHub, jsDelivr)
