# CLAUDE.md

Liaison Assistant: a private, local-AI web app (PWA) for liaison nurses. Formerly a Chrome extension stub.
This project is unrelated to NurseQuizAI.

- Vite + TypeScript + Preact + Tailwind v4. Design tokens live in `src/index.css` (`@theme`).
- `src/speedtest/`: device speed test. AI runs in Web Workers (`*.worker.ts`).
  - Text: WebLLM (`llm.ts`), models in `models.ts`.
  - Speech: transformers.js + Moonshine (`stt.ts`).
- No backend. Never add network calls that send user data anywhere. CSP in `index.html` enforces this.
- Never put real patient data in prompts, tests, or fixtures.

Commands: `npm run dev`, `npm test`, `npm run build` (also typechecks).
