import { useState } from 'preact/hooks';
import { Check, Copy, Play } from 'lucide-preact';
import { Button, Card } from '../ui';
import { useI18n, type Key } from '../i18n';
import { ai } from '../ai/engine';
import { detectTextLang } from '../review/prompts';
import { findSensitive } from '../review/sensitive';
import { markdownToPlain } from '../review/format';
import { rewriteText, UnreliableError } from '../review/rewrite';
import { SAMPLES } from './samples';

type Result = {
  id: string;
  status: 'ok' | 'setAside' | 'error';
  seconds: number;
  sameLang: boolean;
  detailsKept: boolean;
  lengthRatio: number;
  keptAsIs: number;
  output: string;
};

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/**
 * Quality bench (#/bench): runs made-up sample texts through the on-device AI with the real rewrite
 * pipeline and scores each result. Used to compare AI modes and prompts on a given computer.
 */
export function Bench() {
  const { t } = useI18n();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function runAll() {
    setResults([]);
    for (const sample of SAMPLES) {
      setRunning(sample.id);
      const start = performance.now();
      let result: Result;
      try {
        const { text, keptAsIs } = await rewriteText({ id: sample.task }, sample.text, () => {});
        const plainOut = markdownToPlain(text);
        result = {
          id: sample.id,
          status: 'ok',
          seconds: (performance.now() - start) / 1000,
          sameLang: detectTextLang(plainOut) === detectTextLang(sample.text),
          detailsKept: findSensitive(sample.text).every((m) => plainOut.includes(m.text)),
          lengthRatio: words(plainOut) / words(sample.text),
          keptAsIs,
          output: text,
        };
      } catch (err) {
        result = {
          id: sample.id,
          status: err instanceof UnreliableError ? 'setAside' : 'error',
          seconds: (performance.now() - start) / 1000,
          sameLang: false,
          detailsKept: false,
          lengthRatio: 0,
          keptAsIs: 0,
          output: err instanceof Error ? err.message : String(err),
        };
      }
      setResults((r) => [...r, result]);
    }
    setRunning(null);
  }

  const ok = results.filter((r) => r.status === 'ok');
  const summary = results.length
    ? `${ok.length}/${results.length} ${t('bench.usable')} · ${ok.filter((r) => r.sameLang).length}/${ok.length} ${t('bench.sameLang')} · ${ok.filter((r) => r.detailsKept).length}/${ok.length} ${t('bench.details')} · ${(results.reduce((s, r) => s + r.seconds, 0) / results.length).toFixed(1)} s ${t('bench.avg')}`
    : '';

  async function copyReport() {
    const lines = [
      `Confi quality bench · ${t(`mode.${ai.mode}` as Key)} · ${new Date().toISOString()}`,
      `Version ${__APP_VERSION__} · ${navigator.userAgent}`,
      summary,
      '',
      ...results.flatMap((r) => [
        `## ${r.id} · ${r.status} · ${r.seconds.toFixed(1)} s · lang ${r.sameLang ? 'ok' : 'NO'} · details ${r.detailsKept ? 'ok' : 'NO'} · length ×${r.lengthRatio.toFixed(2)} · paragraphs kept as-is ${r.keptAsIs}`,
        r.output,
        '',
      ]),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">{t('bench.title')}</h2>
        <p class="mt-1 text-sm text-muted">{t('bench.intro', { mode: t(`mode.${ai.mode}` as Key) })}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button onClick={runAll} disabled={running !== null} icon={Play}>
          {running ? t('bench.running', { id: running }) : t('bench.run', { n: SAMPLES.length })}
        </Button>
        {results.length > 0 && (
          <Button variant="secondary" onClick={copyReport} disabled={running !== null} icon={copied ? Check : Copy}>
            {copied ? t('editor.copied') : t('bench.copy')}
          </Button>
        )}
        {summary && <span class="text-sm font-medium">{summary}</span>}
      </div>
      {results.map((r) => (
        <Card title={r.id}>
          <p class="text-xs text-muted">
            {t(`bench.status.${r.status}` as Key)} · {r.seconds.toFixed(1)} s · {t('bench.sameLang')}: {r.sameLang ? '✓' : '✗'} ·{' '}
            {t('bench.details')}: {r.detailsKept ? '✓' : '✗'} · ×{r.lengthRatio.toFixed(2)}
          </p>
          <pre class="mt-3 whitespace-pre-wrap rounded-lg bg-canvas p-3 font-sans text-sm">{r.output}</pre>
        </Card>
      ))}
    </div>
  );
}
