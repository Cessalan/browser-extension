# Liaison Assistant

Private, on-device assistant for liaison nurses: review emails, dictate notes, organize thoughts.
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

## Put it online (GitHub Pages)

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Merge to `main` (or run the "Deploy to GitHub Pages" workflow by hand)
3. Open `https://<user>.github.io/<repo>/`

## Stack

- Vite + TypeScript + Preact + Tailwind, installable PWA
- Text AI: WebLLM (WebGPU), default Gemma 3 1B
- Dictation: transformers.js + Moonshine Tiny (CPU)
- Privacy: Content-Security-Policy in `index.html` only allows model downloads (Hugging Face, GitHub, jsDelivr)
