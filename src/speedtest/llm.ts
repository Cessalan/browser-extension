import { CreateWebWorkerMLCEngine, hasModelInCache } from '@mlc-ai/web-llm';
import { chatOptions } from './models';

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
        { role: 'system', content: 'You review emails written by a hospital liaison nurse. Reply with 3 short bullet points: what is unclear, what is missing, and one suggested fix.' },
        { role: 'user', content: SAMPLE_EMAIL },
      ],
      max_tokens: 160,
      temperature: 0.3,
      extra_body: modelId.startsWith('Qwen3') ? { enable_thinking: false } : undefined,
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
