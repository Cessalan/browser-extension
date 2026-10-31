import { useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import { Check, Copy, Languages, Lock, Sparkles, WifiOff, Zap } from 'lucide-preact';
import { setLang, translate, useI18n, type Key, type Lang } from '../i18n';
import { useAiStatus } from '../ai/engine';
import { RichEditor } from '../review/RichEditor';
import { IssuePopover, isSureFix, useProofread } from '../review/proofread';
import { ShimmerText } from '../ui';

const PAGE_URL: Record<Lang, string> = { fr: '/correcteur/', en: '/en/french-grammar-checker/' };
const logo = `${import.meta.env.BASE_URL}icon.svg`;

/**
 * Standalone French grammar checker (/correcteur/, /en/french-grammar-checker/): open and type, no setup.
 * Rules first (Grammalecte, the French dictionary, our shorthand list); the AI adds corrections only when
 * it is already installed on this computer, so this page never starts a download.
 */
export function GrammarPage() {
  const { lang, t } = useI18n();
  const status = useAiStatus();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [empty, setEmpty] = useState(true);
  const [copied, setCopied] = useState(false);
  const proof = useProofread(editor, 'fr');
  const aiInstalled = status.state === 'ready' || (status.state === 'idle' && status.cached === true);
  const n = proof.found.length;
  const fixable = proof.found.some((f) => isSureFix(f.issue));

  function example() {
    editor?.commands.setContent(`<p>${t('gc.exampleText')}</p>`, { emitUpdate: true });
    editor?.commands.focus('end');
  }

  async function copy() {
    if (!editor) return;
    await navigator.clipboard.writeText(editor.getText({ blockSeparator: '\n\n' }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="min-h-screen bg-canvas text-ink">
      <header class="border-b border-line bg-surface">
        <div class="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <a href="/" class="flex items-center gap-3">
            <img src={logo} alt="" class="h-8 w-8" />
            <span class="text-lg font-semibold tracking-tight">Confi</span>
          </a>
          <a
            href={PAGE_URL[lang === 'fr' ? 'en' : 'fr']}
            lang={lang === 'fr' ? 'en' : 'fr'}
            class="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
            onClick={(e) => {
              // Same page in the other language: switch in place, and update the address for sharing.
              e.preventDefault();
              const next = lang === 'fr' ? 'en' : 'fr';
              setLang(next);
              history.replaceState(null, '', PAGE_URL[next]);
              document.title = translate(next, 'gc.docTitle');
            }}
          >
            <Languages size={16} aria-hidden="true" /> {t('app.switchLang')}
          </a>
        </div>
      </header>

      <main class="mx-auto max-w-4xl px-4 py-8">
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{t('gc.title')}</h1>
        <p class="mt-3 max-w-2xl text-lg text-muted">{t('gc.subtitle')}</p>

        <div class="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div class="min-h-[14rem] px-5 py-4 text-[16px] leading-relaxed">
            <RichEditor
              placeholder={t('gc.placeholder')}
              autofocus
              class="min-h-[12rem]"
              onReady={setEditor}
              onChange={(md) => setEmpty(!md.trim())}
            />
          </div>
          <div class="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-sm">
            {empty ? (
              <button type="button" class="font-medium text-brand underline" onClick={example}>
                {t('editor.example')}
              </button>
            ) : proof.ai ? (
              <>
                <ShimmerText>{t('proof.aiRunning', { done: proof.ai.done, total: proof.ai.total })}</ShimmerText>
                <button type="button" class="text-muted underline hover:text-ink" onClick={proof.stopAi}>{t('proof.stop')}</button>
              </>
            ) : n === 0 ? (
              <span class="inline-flex items-center gap-1 text-good">
                <Check size={14} aria-hidden="true" /> {t('proof.none')}
              </span>
            ) : (
              <>
                <span class="font-medium">{n === 1 ? t('proof.count1') : t('proof.count', { n })}</span>
                {fixable && (
                  <button type="button" class="font-medium text-brand hover:underline" onClick={proof.fixAll}>
                    {t('proof.fixAll')}
                  </button>
                )}
              </>
            )}
            <div class="ml-auto flex flex-wrap items-center gap-2">
              {!empty &&
                (aiInstalled ? (
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-medium hover:border-brand/40 disabled:opacity-50"
                    disabled={proof.ai !== null}
                    onClick={() => void proof.runAi()}
                  >
                    <Sparkles size={15} class="text-brand" aria-hidden="true" /> {t('gc.ai')}
                  </button>
                ) : (
                  <a href="/#/welcome" class="text-xs text-muted underline hover:text-ink">
                    {t('gc.aiSetup')}
                  </a>
                ))}
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-medium text-white shadow-button hover:bg-brand-strong disabled:opacity-50"
                disabled={empty}
                onClick={() => void copy()}
              >
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? t('gc.copied') : t('gc.copy')}
              </button>
            </div>
          </div>
        </div>
        {proof.active && (
          <IssuePopover
            entry={proof.active.entry}
            rect={proof.active.rect}
            onFix={(s) => proof.fix(proof.active!.entry, s)}
            onIgnore={() => proof.ignore(proof.active!.entry)}
            onClose={proof.close}
          />
        )}

        <ul class="mt-8 grid gap-4 sm:grid-cols-3">
          <Point icon={Zap} title={t('gc.p1.title')} text={t('gc.p1.text')} />
          <Point icon={Sparkles} title={t('gc.p2.title')} text={t('gc.p2.text')} />
          <Point icon={Lock} title={t('gc.p3.title')} text={t('gc.p3.text')} />
        </ul>

        <section class="mt-12">
          <h2 class="text-2xl font-semibold tracking-tight">{t('gc.faq.title')}</h2>
          <div class="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {(['1', '2', '3', '4'] as const).map((k) => (
              <details class="group px-5 py-4">
                <summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {t(`gc.faq.${k}.q` as Key)}
                  <span class="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p class="mt-2 leading-relaxed text-muted">{t(`gc.faq.${k}.a` as Key)}</p>
              </details>
            ))}
          </div>
        </section>

        <div class="mt-10 flex flex-wrap items-center gap-4 rounded-2xl border border-brand/20 bg-brand-soft/50 p-5">
          <WifiOff size={22} class="text-brand" aria-hidden="true" />
          <p class="min-w-0 flex-1">{t('gc.more')}</p>
          <a href="/" class="rounded-xl bg-brand px-4 py-2 font-medium text-white shadow-button hover:bg-brand-strong">
            {t('gc.moreCta')}
          </a>
        </div>
      </main>

      <footer class="border-t border-line">
        <div class="mx-auto flex max-w-4xl flex-wrap gap-x-4 gap-y-1 px-4 py-6 text-xs text-muted">
          <span>{t('gc.credit')}</span>
          <a href="https://grammalecte.net/" class="underline hover:text-ink" rel="noopener">Grammalecte</a>
          <a href={lang === 'fr' ? '/blog/' : '/en/blog/'} class="hover:text-ink">{t('nav.blog')}</a>
          <span class="ml-auto">{t('app.version', { v: __APP_VERSION__ })}</span>
        </div>
      </footer>
    </div>
  );
}

function Point({ icon: Icon, title, text }: { icon: typeof Zap; title: string; text: string }) {
  return (
    <li class="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <Icon size={20} class="text-brand" aria-hidden="true" />
      <h3 class="mt-3 font-semibold">{title}</h3>
      <p class="mt-1 text-sm leading-relaxed text-muted">{text}</p>
    </li>
  );
}
