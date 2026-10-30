# CLAUDE.md

Confi: a private, local-AI web app (PWA) for anyone who reviews and corrects text containing sensitive data (healthcare, legal, HR, social services…). Started for liaison nurses; keep wording and prompts general. Formerly a Chrome extension stub.
This project is unrelated to NurseQuizAI.

- Vite + TypeScript + Preact + Tailwind v4. Design tokens live in `src/index.css` (`@theme`).
- `src/i18n.ts`: English/French UI strings. French is picked from the browser language; header button switches. Add every new UI string to both dictionaries.
- `src/landing/`: first-visit landing page (`#/welcome`): value, privacy, guided setup (device check, AI mode, download). Keep claims factual: no compliance badges.
- `src/ai/engine.ts`: shared on-device text model. When Chrome offers its built-in AI (Gemini Nano, Prompt API, `builtin.ts`), the "Built into Chrome" mode is recommended: far better writing than our small models, still on-device; it falls back to a downloaded model if it fails. GPU modes run WebLLM (WebGPU); "Compatible" mode runs `cpu.worker.ts` (transformers.js on WebAssembly) for computers without usable graphics, and is the automatic fallback if the GPU fails. Dev only: open `/?mockai` for a fake AI.
- `src/sw.ts`: our service worker (PWA, injectManifest). Besides offline caching it adds COOP/COEP headers so the page is cross-origin isolated (multi-threaded CPU mode); GitHub Pages can't send those headers.
- `src/review/`: Review email screen (paste, check, rewrite, custom instruction, compare, copy). Prompts must keep the email's language (EN or FR).
  - Proofreading (`src/check/`, `proofread.tsx`): underlines in the editor, click to fix, "Fix all" applies only sure fixes. No AI: shorthand list, basic rules, Harper (English) and the Hunspell French dictionary in `spell.worker.ts`. The "Fix spelling & grammar" button asks the AI for small "wrong => right" corrections (`aiEdits.ts`); Confi keeps only those it can verify (really in the text, small, no protected detail). The AI never rewrites the text here.
  - Assistant chat (`Assistant.tsx`, `chat.ts`), shown in "Built into Chrome" mode: the AI asks a question or proposes a new version (`<text>…</text>`), shown side by side; it never edits the text itself. Details locked as [X1]; a proposal that loses one is set aside. Not saved.
  - Translation FR ↔ EN (`src/ai/translate.ts`): Chrome's built-in Translator when available, else Confi's AI; line by line, details locked as [X1] markers.
  - Small-model quality: `prompts.ts` writes prompts in the text's own language with a worked example; `rewrite.ts` locks sensitive details as [X1] markers (`src/ai/mask.ts`), rewrites fix/professional paragraph by paragraph, and keeps a paragraph as-is if the AI lost a detail or went off-topic.
  - `src/bench/` (`#/bench`, linked from Setup's technical details): runs made-up samples through the real pipeline and scores them. Use it to tune prompts.
  - Rich text editor: TipTap (`RichEditor.tsx`). The draft is stored as Markdown (`format.ts`) because that is what the AI reads and writes; copy puts HTML + plain text on the clipboard. `sensitive.ts` flags patient identifiers without AI.
- `src/speedtest/`: the Setup page (device check + AI mode). AI runs in Web Workers (`*.worker.ts`).
  - Text: WebLLM (`llm.ts`). `models.ts` maps AI modes (Faster / Standard / Smarter) to models.
  - `recommend.ts` picks the mode for each computer (specs first, then measured speed). Used until the nurse picks one.
  - Never show model names or jargon in the main UI; technical details stay in the collapsed section.
  - Speech: transformers.js + Moonshine (`stt.ts`).
- No backend. Never add network calls that send user data anywhere. CSP in `index.html` enforces this.
- Never put real patient data in prompts, tests, or fixtures.

Commands: `npm run dev`, `npm test`, `npm run build` (also typechecks).
