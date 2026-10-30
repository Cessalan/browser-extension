import { ai } from '../ai/engine';
import { dropMarkers, lockDetails, markersIn, unlockDetails } from '../ai/mask';
import { looksUnrelated } from '../ai/quality';
import { markdownToPlain } from './format';
import { cleanRewrite, customMessages, rewriteMessages, type RewriteId } from './prompts';

/** A rewrite came back unusable: off-topic, empty, or a protected detail went missing. */
export class UnreliableError extends Error {
  constructor() {
    super('Unreliable suggestion');
    this.name = 'UnreliableError';
  }
}

export type RewriteJob = { id: RewriteId } | { instruction: string };

/**
 * Light edits work best one paragraph at a time with small models (less to get lost in, and a bad
 * paragraph can simply be kept as it was). Restructuring (shorter, clearer, custom) needs the whole text.
 */
const BY_PARAGRAPH: RewriteId[] = ['fix', 'professional'];

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const normalizeMarkers = (text: string) => text.replace(/\[\s*x(\d+)\s*\]/gi, '[X$1]');

/**
 * Rewrites Markdown text with the on-device AI, built for the smallest models:
 * sensitive details are locked behind markers, light edits go paragraph by paragraph, and every
 * piece is checked (kept its markers, still about the same thing) before it's accepted.
 */
export async function rewriteText(
  job: RewriteJob,
  markdown: string,
  onText: (text: string) => void,
): Promise<{ text: string; keptAsIs: number }> {
  const { text: lockedText, locked } = lockDetails(markdown);
  const byParagraph = 'id' in job && BY_PARAGRAPH.includes(job.id);
  const pieces = byParagraph ? lockedText.split(/\n{2,}/) : [lockedText];
  const done: string[] = [];
  let keptAsIs = 0;
  let edited = 0;
  const show = (current?: string) =>
    onText(unlockDetails([...done, ...(current === undefined ? [] : [current])].join('\n\n'), locked).text);

  for (const piece of pieces) {
    // A name or a one-word sign-off: nothing worth sending to the AI.
    if (countWords(piece) < 2) {
      done.push(piece);
      continue;
    }
    const messages = 'id' in job ? rewriteMessages(job.id, piece) : customMessages(job.instruction, piece);
    const maxTokens = Math.min(2000, countWords(piece) * 3 + 60);
    // Paragraph by paragraph, a paragraph appears only once it's checked, so the person never sees one
    // that gets swapped back. A whole-text rewrite streams as it's written.
    const onPiece = byParagraph ? () => {} : (t: string) => show(normalizeMarkers(cleanRewrite(t)));
    // A marker from another paragraph would copy that detail here: drop it like an invented one.
    const reply = dropMarkers(normalizeMarkers(cleanRewrite(await ai.generate(messages, onPiece, maxTokens))), markersIn(piece));

    const lostDetail = markersIn(piece).some((m) => !reply.includes(m));
    // Custom instructions may ask for a translation, so only built-in edits are checked for relevance.
    const offTopic = 'id' in job && looksUnrelated(markdownToPlain(piece), markdownToPlain(reply));
    if (!reply || lostDetail || offTopic) {
      if (!byParagraph) throw new UnreliableError();
      done.push(piece);
      keptAsIs++;
    } else {
      done.push(reply);
      edited++;
    }
    show();
  }

  if (byParagraph && edited === 0 && keptAsIs > 0) throw new UnreliableError();
  return { text: unlockDetails(done.join('\n\n'), locked).text, keptAsIs };
}
