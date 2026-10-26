import type { TextLang } from '../review/prompts';
import type { Issue } from './types';

/**
 * Shorthand people type in a hurry, and the full form for a message someone else will read.
 * Only lowercase or capitalized forms are matched: "PT" (physiotherapy) or "R" stay as they are.
 */
const SHORTHAND: Record<TextLang, Record<string, string>> = {
  fr: {
    pt: 'patient',
    pts: 'patients',
    rdv: 'rendez-vous',
    svp: 's’il vous plaît',
    stp: 's’il te plaît',
    bcp: 'beaucoup',
    pcq: 'parce que',
    qqn: 'quelqu’un',
    qqch: 'quelque chose',
    tjrs: 'toujours',
    tjs: 'toujours',
    mtn: 'maintenant',
    pr: 'pour',
    ds: 'dans',
    msg: 'message',
    eval: 'évaluation',
    éval: 'évaluation',
    réadapt: 'réadaptation',
    physio: 'physiothérapie',
    ergo: 'ergothérapie',
    ca: 'ça',
    cest: 'c’est',
    jai: 'j’ai',
    dr: 'Dr',
    dre: 'Dre',
    mme: 'Mme',
  },
  en: {
    u: 'you',
    r: 'are',
    ur: 'your',
    pls: 'please',
    plz: 'please',
    thx: 'thanks',
    thnx: 'thanks',
    'b/c': 'because',
    'w/': 'with',
    'w/o': 'without',
    abt: 'about',
    appt: 'appointment',
    pt: 'patient',
    pts: 'patients',
    'f/u': 'follow-up',
    eval: 'evaluation',
    dr: 'Dr.',
    im: 'I’m',
  },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Finds shorthand in one paragraph and suggests the full form. */
export function findShorthand(text: string, lang: TextLang): Issue[] {
  const issues: Issue[] = [];
  // Words, plus the slash forms ("w/", "b/c"). Not preceded by a letter, digit or apostrophe ("l'eval" still matches "eval").
  for (const m of text.matchAll(/(?<![\p{L}\p{N}/])[\p{L}]+(?:\/[\p{L}]*)?(?![\p{L}\p{N}])/gu)) {
    const word = m[0];
    const lower = word.toLowerCase();
    let full = SHORTHAND[lang][lower];
    if (!full) continue;
    // "Dr." already written with its dot: just capitalize.
    if (lang === 'en' && lower === 'dr' && text[m.index + word.length] === '.') full = 'Dr';
    if (word === lower) {
      // As typed.
    } else if (word === capitalize(lower) && word.length > 1) {
      full = capitalize(full);
    } else {
      continue; // ALL CAPS or odd casing: likely an acronym with another meaning.
    }
    if (full === word) continue;
    issues.push({ start: m.index, end: m.index + word.length, text: word, suggestions: [full], kind: 'shorthand', source: 'rules' });
  }
  return issues;
}
