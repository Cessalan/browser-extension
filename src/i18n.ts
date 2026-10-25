import { useEffect, useState } from 'preact/hooks';

export type Lang = 'en' | 'fr';

const en = {
  // App shell
  'nav.review': 'Review email',
  'nav.setup': 'Setup',
  'app.private': 'Runs on this computer only',
  'app.switchLang': 'Français',
  'app.version': 'Version {v}',
  'update.available': 'A new version is available.',
  'update.refresh': 'Refresh',
  'update.later': 'Later',
  'update.draftHint': 'Copy your draft first: refreshing clears it.',

  // AI status
  'ai.ready': 'AI ready · on this computer',
  'ai.starting': 'AI starting {pct}%',
  'ai.retry': "AI couldn't start · Retry",
  'ai.download': 'Download AI (~{mb} MB, once)',
  'ai.checking': 'Checking AI…',
  'ai.startingLong': 'Starting the AI… {pct}%',
  'ai.firstTimeOnly': 'First time only. After this it starts in seconds.',

  // Review: toolbar
  'review.check': 'Check my email',
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
  'editor.undo': 'Undo',
  'editor.undoTitle': 'Undo last change',
  'editor.clear': 'Clear',
  'editor.placeholder': 'Paste or type your email here…',
  'editor.copy': 'Copy to send',
  'editor.copied': 'Copied',
  'editor.example': 'Try with an example',
  'editor.notSaved': 'Not saved. Closing the tab clears it.',
  'editor.long': 'Long email: the AI works best under ~1,000 words.',

  // Review: compare
  'compare.removed': 'Removed text in red',
  'compare.added': 'Added text in blue',
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
  'sensitive.title': 'Patient details found',
  'sensitive.hint': 'Send through secure email, or remove them:',
  'sensitive.jump': 'Show it in the email',
  'kind.ssn': 'SSN',
  'kind.nam': 'Health insurance no.',
  'kind.mrn': 'Medical record no.',
  'kind.dob': 'Date of birth',
  'kind.phone': 'Phone',
  'kind.email': 'Email address',
  'kind.date': 'Date',
  'kind.id': 'Long ID number',

  // Setup (device check + AI mode)
  'setup.title': 'Setup',
  'setup.intro': 'Check that this computer can run Confi, and choose how the AI works. Everything stays on this computer.',
  'setup.checking': 'Checking this computer…',
  'setup.runTest': 'Test a mode below to see how fast Confi runs here.',
  'setup.ready': 'This computer is ready for Confi.',
  'setup.okSlow': 'Confi works here, but answers may be a little slow.',
  'setup.slow': 'Confi is slow on this computer.',
  'setup.suggest': '"{mode}" mode is a better fit for this computer.',
  'setup.switchTo': 'Use {mode}',
  'setup.autoPicked': 'Confi picked this mode for your computer. You can change it.',
  'setup.notSupported': "This browser can't run Confi's AI.",
  'setup.notSupportedHint': 'Open Confi in an up-to-date Chrome or Edge.',
  'setup.graphics': 'Graphics acceleration',
  'setup.memory': '{gb}+ GB memory',
  'setup.space': '{gb} GB free space',
  'setup.mode': 'AI mode',
  'setup.recommended': 'Suggested for this computer',
  'setup.mb': 'MB',
  'setup.runTestTitle': 'Ready to check this computer',
  'trust.local': 'Stays on this computer',
  'trust.offline': 'Works offline after setup',
  'trust.noAccount': 'No account, no tracking',
  'setup.testFirst': 'This mode may be heavy for this computer. Test it to make sure it runs well.',
  'setup.testMode': 'Test this mode',
  'setup.modeSaved': 'Your choice is saved on this computer.',
  'setup.starting': 'Starting…',
  'setup.downloading': 'Downloading… {pct}%',
  'setup.almostReady': 'Almost ready…',
  'setup.writing': 'Writing assistant',
  'setup.writingSpeed': 'Writing speed',
  'setup.wordsPerSec': '~{n} words per second',
  'setup.startsIn': 'Starts writing in',
  'setup.readyIn': 'Ready in',
  'setup.firstSetup': 'First-time setup',
  'setup.voice': 'Voice typing',
  'setup.testVoice': 'Test voice typing',
  'setup.voiceInfo': 'Types out a short sample recording. ~60 MB, one time.',
  'setup.voiceSpeed': 'Voice typing speed',
  'setup.voiceResult': '{a} s of speech typed in {t} s',
  'setup.technical': 'Technical details',
  'setup.technicalHint': 'For IT or support. Contains no patient data.',
  'setup.copy': 'Copy for support',
  'mode.fast': 'Faster',
  'mode.fast.desc': 'Quick answers, simpler writing. Best for older computers.',
  'mode.standard': 'Standard',
  'mode.standard.desc': 'Good balance of quality and speed.',
  'mode.smart': 'Smarter',
  'mode.smart.desc': 'Best writing. Needs a powerful computer.',
  'verdict.good': 'Fast',
  'verdict.ok': 'OK',
  'verdict.slow': 'Slow',
};

export type Key = keyof typeof en;

const fr: Record<Key, string> = {
  'nav.review': 'Réviser un courriel',
  'nav.setup': 'Configuration',
  'app.private': 'Fonctionne sur cet ordinateur seulement',
  'app.switchLang': 'English',
  'app.version': 'Version {v}',
  'update.available': 'Une nouvelle version est disponible.',
  'update.refresh': 'Actualiser',
  'update.later': 'Plus tard',
  'update.draftHint': "Copiez votre brouillon d'abord : actualiser l'efface.",

  'ai.ready': 'IA prête · sur cet ordinateur',
  'ai.starting': "Démarrage de l'IA {pct} %",
  'ai.retry': "L'IA n'a pas démarré · Réessayer",
  'ai.download': "Télécharger l'IA (~{mb} Mo, une fois)",
  'ai.checking': "Vérification de l'IA…",
  'ai.startingLong': "Démarrage de l'IA… {pct} %",
  'ai.firstTimeOnly': 'La première fois seulement. Ensuite, elle démarre en quelques secondes.',

  'review.check': 'Vérifier mon courriel',
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
  'editor.undo': 'Annuler',
  'editor.undoTitle': 'Annuler la dernière modification',
  'editor.clear': 'Effacer',
  'editor.placeholder': 'Collez ou écrivez votre courriel ici…',
  'editor.copy': 'Copier pour envoyer',
  'editor.copied': 'Copié',
  'editor.example': 'Essayer avec un exemple',
  'editor.notSaved': "Rien n'est enregistré. Fermer l'onglet efface tout.",
  'editor.long': "Courriel long : l'IA fonctionne mieux sous ~1 000 mots.",

  'compare.removed': 'Texte retiré en rouge',
  'compare.added': 'Texte ajouté en bleu',
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

  'sensitive.title': 'Renseignements sur le patient détectés',
  'sensitive.hint': 'Envoyez par courriel sécurisé ou retirez-les :',
  'sensitive.jump': 'Le montrer dans le courriel',
  'kind.ssn': 'NAS',
  'kind.nam': "N° d'assurance maladie",
  'kind.mrn': 'N° de dossier',
  'kind.dob': 'Date de naissance',
  'kind.phone': 'Téléphone',
  'kind.email': 'Adresse courriel',
  'kind.date': 'Date',
  'kind.id': "Long numéro d'identification",

  'setup.title': 'Configuration',
  'setup.intro': "Vérifiez que cet ordinateur peut faire fonctionner Confi et choisissez comment l'IA fonctionne. Tout reste sur cet ordinateur.",
  'setup.checking': 'Vérification de cet ordinateur…',
  'setup.runTest': 'Testez un mode ci-dessous pour voir la vitesse de Confi ici.',
  'setup.ready': 'Cet ordinateur est prêt pour Confi.',
  'setup.okSlow': 'Confi fonctionne ici, mais les réponses peuvent être un peu lentes.',
  'setup.slow': 'Confi est lent sur cet ordinateur.',
  'setup.suggest': 'Le mode « {mode} » convient mieux à cet ordinateur.',
  'setup.switchTo': 'Utiliser {mode}',
  'setup.autoPicked': 'Confi a choisi ce mode pour votre ordinateur. Vous pouvez le changer.',
  'setup.notSupported': "Ce navigateur ne peut pas faire fonctionner l'IA de Confi.",
  'setup.notSupportedHint': 'Ouvrez Confi dans une version récente de Chrome ou Edge.',
  'setup.graphics': 'Accélération graphique',
  'setup.memory': '{gb}+ Go de mémoire',
  'setup.space': "{gb} Go d'espace libre",
  'setup.mode': "Mode de l'IA",
  'setup.recommended': 'Suggéré pour cet ordinateur',
  'setup.mb': 'Mo',
  'setup.runTestTitle': 'Prêt à vérifier cet ordinateur',
  'trust.local': 'Reste sur cet ordinateur',
  'trust.offline': 'Fonctionne hors ligne après l’installation',
  'trust.noAccount': 'Aucun compte, aucun suivi',
  'setup.testFirst': 'Ce mode peut être exigeant pour cet ordinateur. Testez-le pour vérifier qu’il fonctionne bien.',
  'setup.testMode': 'Tester ce mode',
  'setup.modeSaved': 'Votre choix est enregistré sur cet ordinateur.',
  'setup.starting': 'Démarrage…',
  'setup.downloading': 'Téléchargement… {pct} %',
  'setup.almostReady': 'Presque prêt…',
  'setup.writing': "Assistant d'écriture",
  'setup.writingSpeed': "Vitesse d'écriture",
  'setup.wordsPerSec': '~{n} mots par seconde',
  'setup.startsIn': 'Commence à écrire en',
  'setup.readyIn': 'Prêt en',
  'setup.firstSetup': 'Première installation',
  'setup.voice': 'Dictée',
  'setup.testVoice': 'Tester la dictée',
  'setup.voiceInfo': 'Transcrit un court extrait audio. ~60 Mo, une seule fois.',
  'setup.voiceSpeed': 'Vitesse de dictée',
  'setup.voiceResult': '{a} s de parole transcrites en {t} s',
  'setup.technical': 'Détails techniques',
  'setup.technicalHint': 'Pour le soutien informatique. Ne contient aucune donnée patient.',
  'setup.copy': 'Copier pour le soutien',
  'mode.fast': 'Rapide',
  'mode.fast.desc': 'Réponses rapides, écriture plus simple. Idéal pour les ordinateurs plus anciens.',
  'mode.standard': 'Standard',
  'mode.standard.desc': 'Bon équilibre entre qualité et vitesse.',
  'mode.smart': 'Avancé',
  'mode.smart.desc': 'Meilleure écriture. Demande un ordinateur puissant.',
  'verdict.good': 'Rapide',
  'verdict.ok': 'Correct',
  'verdict.slow': 'Lent',
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
