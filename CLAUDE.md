# CLAUDE.md

Confi: a private, local-AI web app (PWA) for anyone who reviews and corrects text containing sensitive data (healthcare, legal, HR, social services…). Started for liaison nurses; keep wording and prompts general. Formerly a Chrome extension stub.
This project is unrelated to NurseQuizAI.

- Vite + TypeScript + Preact + Tailwind v4. Design tokens live in `src/index.css` (`@theme`).
- `src/i18n.ts`: English/French UI strings. French is picked from the browser language; header button switches. Add every new UI string to both dictionaries.
- `src/landing/`: first-visit landing page (`#/welcome`): value, privacy, guided setup (device check, AI mode, download). Keep claims factual: no compliance badges.
- `src/ai/engine.ts`: shared on-device text model. GPU modes run WebLLM (WebGPU); "Compatible" mode runs `cpu.worker.ts` (transformers.js on WebAssembly) for computers without usable graphics, and is the automatic fallback if the GPU fails. Dev only: open `/?mockai` for a fake AI.
- `src/sw.ts`: our service worker (PWA, injectManifest). Besides offline caching it adds COOP/COEP headers so the page is cross-origin isolated (multi-threaded CPU mode); GitHub Pages can't send those headers.
- `src/review/`: Review email screen (paste, check, rewrite, custom instruction, compare, copy). Prompts must keep the email's language (EN or FR).
  - Rich text editor: TipTap (`RichEditor.tsx`). The draft is stored as Markdown (`format.ts`) because that is what the AI reads and writes; copy puts HTML + plain text on the clipboard. `sensitive.ts` flags patient identifiers without AI.
- `src/speedtest/`: the Setup page (device check + AI mode). AI runs in Web Workers (`*.worker.ts`).
  - Text: WebLLM (`llm.ts`). `models.ts` maps AI modes (Faster / Standard / Smarter) to models.
  - `recommend.ts` picks the mode for each computer (specs first, then measured speed). Used until the nurse picks one.
  - Never show model names or jargon in the main UI; technical details stay in the collapsed section.
  - Speech: transformers.js + Moonshine (`stt.ts`).
- No backend. Never add network calls that send user data anywhere. CSP in `index.html` enforces this.
- Never put real patient data in prompts, tests, or fixtures.

Commands: `npm run dev`, `npm test`, `npm run build` (also typechecks).
