/*
 * Confi's wrapper (not part of Grammalecte): runs Grammalecte's French grammar checker in a classic
 * worker, since its files are plain scripts that share globals. Loads on the first request.
 * Request: { id, text } or { id, warm: true }. Reply: { id, errors } or { id, error }.
 */
/* global importScripts, gc_engine, conj, phonet, mfsp, helpers */

let ready = false;

function load() {
  if (ready) return;
  importScripts(
    'graphspell/helpers.js', 'graphspell/str_transform.js', 'graphspell/char_player.js', 'graphspell/lexgraph_fr.js',
    'graphspell/ibdawg.js', 'graphspell/spellchecker.js', 'text.js', 'graphspell/tokenizer.js',
    'fr/conj.js', 'fr/mfsp.js', 'fr/phonet.js', 'fr/cregex.js', 'fr/gc_options.js', 'fr/gc_functions.js',
    'fr/gc_rules.js', 'fr/gc_rules_graph.js', 'fr/gc_engine.js',
  );
  conj.init(helpers.loadFile('fr/conj_data.json'));
  phonet.init(helpers.loadFile('fr/phonet_data.json'));
  mfsp.init(helpers.loadFile('fr/mfsp_data.json'));
  gc_engine.load('JavaScript', 'aRGB', 'graphspell/_dictionaries');
  // Typography rules (curly apostrophes, "..." → "…", inclusive writing, markup, "4 482 913") would flag ordinary email text and file numbers.
  for (const opt of ['typo', 'apos', 'eepi', 'html', 'md', 'num']) gc_engine.setOption(opt, false);
  ready = true;
}

self.onmessage = (e) => {
  const { id, text } = e.data;
  try {
    load();
    const errors = text ? Array.from(gc_engine.parse(text.normalize('NFC'), 'FR')) : [];
    self.postMessage({
      id,
      errors: errors.map((x) => ({ start: x.nStart, end: x.nEnd, suggestions: x.aSuggestions || [], type: x.sType, message: x.sMessage })),
    });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
