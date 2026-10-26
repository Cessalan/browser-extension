import { CreateWebWorkerMLCEngine, hasModelInCache } from '@mlc-ai/web-llm';
import { chatOptions, extraBody } from './models';

// Made-up example. Never put real patient data in test prompts.
export const SAMPLE_EMAIL = `Hi Dr. Smith,
Following up on the referral for the patient we discussed Tuesday. They are ready for discharge to the rehab facility on Friday pending the final PT eval. Can you confirm the orders are signed? The family asked about transport, I told them we would call back.
Thanks, Jordan`;

export interface LlmResult {
  modelId: string;
  wasCached: boolean;
  loadSeconds: number;
  firstTokenSeconds: number;
  tokensPerSecond: number;
  totalSeconds: number;
  output: string;
}

export async function runLlmTest(
  modelId: string,
  onProgress: (fraction: number, text: string) => void,
): Promise<LlmResult> {
  const wasCached = await hasModelInCache(modelId).catch(() => false);
  const worker = new Worker(new URL('../ai/llm.worker.ts', import.meta.url), { type: 'module' });

  try {
    const t0 = performance.now();
    const engine = await CreateWebWorkerMLCEngine(
      worker,
      modelId,
      { initProgressCallback: (p) => onProgress(p.progress, p.text) },
      chatOptions(modelId),
    );
    const loadSeconds = (performance.now() - t0) / 1000;

    onProgress(1, 'Running test prompt…');
    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'You review a short professional email. Reply with 3 short bullet points: what is unclear, what is missing, and one suggested fix.' },
        { role: 'user', content: SAMPLE_EMAIL },
      ],
      max_tokens: 160,
      temperature: 0.3,
      extra_body: extraBody(modelId),
    });
    const extra = reply.usage?.extra;
    await engine.unload();

    return {
      modelId,
      wasCached,
      loadSeconds,
      firstTokenSeconds: extra?.time_to_first_token_s ?? 0,
      tokensPerSecond: extra?.decode_tokens_per_s ?? 0,
      totalSeconds: extra?.e2e_latency_s ?? 0,
      output: reply.choices[0]?.message.content ?? '',
    };
  } finally {
    worker.terminate();
  }
}

/**
 * Speed test for "Compatible" (processor) mode, run through the shared AI engine.
 * The CPU engine doesn't report token counts, so speed is estimated from characters (~4 per token).
 */
export async function runCpuTest(onProgress: (fraction: number) => void): Promise<LlmResult> {
  const { ai } = await import('../ai/engine');
  const { CPU_MODE } = await import('./models');
  const wasCached = ai.status.state === 'ready' || (ai.status.state === 'idle' && ai.status.cached === true);
  const unsubscribe = ai.subscribe((s) => s.state === 'loading' && onProgress(s.fraction));
  const t0 = performance.now();
  try {
    await ai.load();
  } finally {
    unsubscribe();
  }
  const loadSeconds = (performance.now() - t0) / 1000;
  onProgress(1);

  const t1 = performance.now();
  let first = 0;
  const output = await ai.generate(
    [
      { role: 'system', content: 'You review a short professional email. Reply with 3 short bullet points: what is unclear, what is missing, and one suggested fix.' },
      { role: 'user', content: SAMPLE_EMAIL },
    ],
    (text) => {
      if (!first && text) first = performance.now();
    },
    120,
  );
  const end = performance.now();
  const writingSeconds = Math.max(0.1, (end - (first || t1)) / 1000);
  return {
    modelId: CPU_MODE.modelId,
    wasCached,
    loadSeconds,
    firstTokenSeconds: ((first || end) - t1) / 1000,
    tokensPerSecond: output.length / 4 / writingSeconds,
    totalSeconds: (end - t1) / 1000,
    output,
  };
}
