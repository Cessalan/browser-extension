import { useEffect, useState } from 'preact/hooks';

export type Lang = 'en' | 'fr';

const en = {
  // App shell
  'nav.review': 'Review email',
  'nav.speedTest': 'Speed test',
  'app.private': '🔒 Runs on this computer only',
  'app.switchLang': 'Français',

  // AI status
  'ai.ready': 'AI ready · on this computer',
  'ai.starting': 'AI starting {pct}%',
  'ai.retry': "AI couldn't start · Retry",
  'ai.download': '⬇ Download AI (~700 MB, once)',
  'ai.checking': 'Checking AI…',
  'ai.startingLong': 'Starting the AI… {pct}%',
  'ai.firstTimeOnly': 'First time only. After this it starts in seconds.',

  // Review: toolbar
  'review.check': '✓ Check my email',
  'review.rewrite': 'Rewrite',
  'rewrite.clearer': 'Clearer',
  'rewrite.professional': 'More professional',
  'rewrite.shorter': 'Shorter',
  'rewrite.fix': 'Fix spelling & grammar',
  'custom.placeholder': 'Tell the AI what to change… e.g. "put the request first and use bullet points"',
  'custom.apply': 'Apply',
  'custom.label': 'Your instruction',

  // Review: editor
  'editor.title': 'Your email',
  'editor.words': '{n} words',
  'editor.undo': '↶ Undo',
  'editor.undoTitle': 'Undo last change',
  'editor.clear': 'Clear',
  'editor.placeholder': 'Paste or type your email here…',
  'editor.copy': 'Copy to send',
  'editor.copied': 'Copied ✓',
  'editor.example': 'Try with an example',
  'editor.notSaved': 'Not saved. Closing the tab clears it.',

  // Review: compare
  'compare.removed': 'Removed text in red',
  'compare.added': 'Added text in green',
  'compare.suggestion': 'Suggestion: {label}',
  'compare.use': 'Use this version',
  'compare.edit': 'Edit',
  'compare.showChanges': 'Show changes',
  'compare.retry': 'Try again',
  'compare.keepMine': 'Keep mine',
  'compare.words': 'words',
  'compare.stop': 'Stop',
  'compare.cancel': 'Cancel',
  'compare.writing': 'Writing… {s}s',
  'compare.refine': 'Ask for more changes… e.g. "make it warmer"',

  // Review: check
  'check.title': 'Check results',
  'check.reading': 'Reading your email… {s}s',
  'check.stale': "You've edited the email since this check.",
  'check.close': 'Close',

  // Sensitive info
  'sensitive.title': '⚠ Patient details found',
  'sensitive.hint': 'Send through secure email, or remove them:',
  'kind.ssn': 'SSN',
  'kind.nam': 'Health insurance no.',
  'kind.mrn': 'Medical record no.',
  'kind.dob': 'Date of birth',
  'kind.phone': 'Phone',
  'kind.email': 'Email address',
  'kind.date': 'Date',
  'kind.id': 'Long ID number',

  // Speed test
  'speed.title': 'Device speed test',
  'speed.intro': "Checks if this computer can run the assistant's AI locally. The first run downloads the models once; later runs use the saved copy. No data leaves this computer.",
  'speed.computer': '1. This computer',
  'speed.checking': 'Checking…',
  'speed.gpuAccel': 'GPU acceleration',
  'speed.ram': 'RAM',
  'speed.cores': 'CPU cores',
  'speed.storage': 'Free storage',
  'speed.gpu': 'GPU',
  'speed.builtInAI': 'Chrome built-in AI',
  'speed.yes': 'Yes',
  'speed.no': 'No',
  'speed.unknown': 'Unknown',
  'speed.noWebgpu': "This browser has no WebGPU. Use an up-to-date Chrome or Edge. The text model can't run without it.",
  'speed.textModel': '2. Writing assistant (text model)',
  'speed.run': 'Run test',
  'speed.speed': 'Speed',
  'speed.firstWord': 'First word',
  'speed.loadCached': 'Load (saved copy)',
  'speed.loadFirst': 'Download + load',
  'speed.model': 'Model',
  'speed.sample': 'Sample output',
  'speed.dictation': '3. Dictation (speech model)',
  'speed.dictationInfo': 'Moonshine Tiny · ~60 MB · transcribes an 11 s sample clip',
  'speed.transcribe': 'Transcribe time',
  'speed.transcribeValue': '{t} s for {a} s audio',
  'speed.load': 'Load',
  'speed.copy': 'Copy results',
  'speed.copied': 'Copied ✓',
  'speed.copyHint': 'Paste the results to share them. They contain only device specs and speeds.',
  'speed.starting': 'Starting…',
};

export type Key = keyof typeof en;

const fr: Record<Key, string> = {
  'nav.review': 'Réviser un courriel',
  'nav.speedTest': 'Test de vitesse',
  'app.private': '🔒 Fonctionne sur cet ordinateur seulement',
  'app.switchLang': 'English',

  'ai.ready': 'IA prête · sur cet ordinateur',
  'ai.starting': "Démarrage de l'IA {pct} %",
  'ai.retry': "L'IA n'a pas démarré · Réessayer",
  'ai.download': "⬇ Télécharger l'IA (~700 Mo, une fois)",
  'ai.checking': "Vérification de l'IA…",
  'ai.startingLong': "Démarrage de l'IA… {pct} %",
  'ai.firstTimeOnly': 'La première fois seulement. Ensuite, elle démarre en quelques secondes.',

  'review.check': '✓ Vérifier mon courriel',
  'review.rewrite': 'Réécrire',
  'rewrite.clearer': 'Plus clair',
  'rewrite.professional': 'Plus professionnel',
  'rewrite.shorter': 'Plus court',
  'rewrite.fix': 'Corriger les fautes',
  'custom.placeholder': "Dites à l'IA quoi changer… ex. : « mets la demande en premier et utilise des puces »",
  'custom.apply': 'Appliquer',
  'custom.label': 'Votre consigne',

  'editor.title': 'Votre courriel',
  'editor.words': '{n} mots',
  'editor.undo': '↶ Annuler',
  'editor.undoTitle': 'Annuler la dernière modification',
  'editor.clear': 'Effacer',
  'editor.placeholder': 'Collez ou écrivez votre courriel ici…',
  'editor.copy': 'Copier pour envoyer',
  'editor.copied': 'Copié ✓',
  'editor.example': 'Essayer avec un exemple',
  'editor.notSaved': "Rien n'est enregistré. Fermer l'onglet efface tout.",

  'compare.removed': 'Texte retiré en rouge',
  'compare.added': 'Texte ajouté en vert',
  'compare.suggestion': 'Suggestion : {label}',
  'compare.use': 'Utiliser cette version',
  'compare.edit': 'Modifier',
  'compare.showChanges': 'Voir les changements',
  'compare.retry': 'Réessayer',
  'compare.keepMine': 'Garder la mienne',
  'compare.words': 'mots',
  'compare.stop': 'Arrêter',
  'compare.cancel': 'Annuler',
  'compare.writing': 'Rédaction… {s} s',
  'compare.refine': "Demander d'autres changements… ex. : « plus chaleureux »",

  'check.title': 'Résultats',
  'check.reading': 'Lecture de votre courriel… {s} s',
  'check.stale': 'Vous avez modifié le courriel depuis cette vérification.',
  'check.close': 'Fermer',

  'sensitive.title': '⚠ Renseignements sur le patient détectés',
  'sensitive.hint': 'Envoyez par courriel sécurisé ou retirez-les :',
  'kind.ssn': 'NAS',
  'kind.nam': "N° d'assurance maladie",
  'kind.mrn': 'N° de dossier',
  'kind.dob': 'Date de naissance',
  'kind.phone': 'Téléphone',
  'kind.email': 'Adresse courriel',
  'kind.date': 'Date',
  'kind.id': "Long numéro d'identification",

  'speed.title': "Test de vitesse de l'appareil",
  'speed.intro': "Vérifie si cet ordinateur peut faire fonctionner l'IA localement. Le premier essai télécharge les modèles une fois; les suivants utilisent la copie enregistrée. Aucune donnée ne quitte cet ordinateur.",
  'speed.computer': '1. Cet ordinateur',
  'speed.checking': 'Vérification…',
  'speed.gpuAccel': 'Accélération GPU',
  'speed.ram': 'Mémoire vive',
  'speed.cores': 'Cœurs du processeur',
  'speed.storage': 'Espace libre',
  'speed.gpu': 'Carte graphique',
  'speed.builtInAI': 'IA intégrée de Chrome',
  'speed.yes': 'Oui',
  'speed.no': 'Non',
  'speed.unknown': 'Inconnu',
  'speed.noWebgpu': "Ce navigateur n'a pas WebGPU. Utilisez une version récente de Chrome ou Edge. Le modèle de texte ne peut pas fonctionner sans.",
  'speed.textModel': "2. Assistant d'écriture (modèle de texte)",
  'speed.run': 'Lancer le test',
  'speed.speed': 'Vitesse',
  'speed.firstWord': 'Premier mot',
  'speed.loadCached': 'Chargement (copie enregistrée)',
  'speed.loadFirst': 'Téléchargement + chargement',
  'speed.model': 'Modèle',
  'speed.sample': 'Exemple de résultat',
  'speed.dictation': '3. Dictée (modèle vocal)',
  'speed.dictationInfo': 'Moonshine Tiny · ~60 Mo · transcrit un extrait de 11 s',
  'speed.transcribe': 'Temps de transcription',
  'speed.transcribeValue': '{t} s pour {a} s d’audio',
  'speed.load': 'Chargement',
  'speed.copy': 'Copier les résultats',
  'speed.copied': 'Copié ✓',
  'speed.copyHint': 'Collez les résultats pour les partager. Ils contiennent seulement les specs et les vitesses.',
  'speed.starting': 'Démarrage…',
};

const DICTS: Record<Lang, Record<Key, string>> = { en, fr };
const STORAGE_KEY = 'lang';

export function detectLang(languages: readonly string[] = navigator.languages ?? [navigator.language]): Lang {
  return languages[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return detectLang();
}

export function translate(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  let text = DICTS[lang][key];
  for (const [k, v] of Object.entries(params ?? {})) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

let current: Lang = initialLang();
const listeners = new Set<(l: Lang) => void>();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not critical: the choice just won't be remembered.
  }
  listeners.forEach((fn) => fn(lang));
}

export function useI18n() {
  const [lang, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => void listeners.delete(set);
  }, []);
  return { lang, t: (key: Key, params?: Record<string, string | number>) => translate(lang, key, params) };
}
