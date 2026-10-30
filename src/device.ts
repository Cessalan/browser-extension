/**
 * What the person is using: phone, tablet or computer, the system and the browser. Used to talk about
 * "this phone" rather than "this computer", pick the right icon, and give advice that fits.
 */

export type DeviceKind = 'phone' | 'tablet' | 'computer';

type Nav = { userAgent: string; maxTouchPoints?: number; userAgentData?: { mobile?: boolean } };

export function deviceKind(nav: Nav = navigator as Nav): DeviceKind {
  const ua = nav.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  // iPadOS reports itself as a Mac; only the touch screen gives it away.
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'tablet';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'phone' : 'tablet';
  if (nav.userAgentData?.mobile || /iPhone|iPod|Mobile|IEMobile|Opera Mini/i.test(ua)) return 'phone';
  return 'computer';
}

/** "iPhone · Safari", "Windows · Chrome"… for the device check. */
export function deviceLabel(nav: Nav = navigator as Nav): string {
  const ua = nav.userAgent;
  const kind = deviceKind(nav);
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : kind === 'tablet' && /iPad|Macintosh/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Mac OS X|Macintosh/.test(ua)
              ? 'Mac'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
  return [system, browserName(ua)].filter(Boolean).join(' · ');
}

export function browserName(ua: string = navigator.userAgent): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return '';
}

const WORDS: Record<'en' | 'fr', Record<Exclude<DeviceKind, 'computer'>, [RegExp, string][]>> = {
  en: {
    phone: [[/\b(this|your|the) computer\b/gi, '$1 phone']],
    tablet: [[/\b(this|your|the) computer\b/gi, '$1 tablet']],
  },
  fr: {
    phone: [
      [/\bcet ordinateur\b/gi, 'ce téléphone'],
      [/\bvotre ordinateur\b/gi, 'votre téléphone'],
      [/\bl[’']ordinateur\b/gi, 'le téléphone'],
    ],
    tablet: [
      [/\bcet ordinateur\b/gi, 'cette tablette'],
      [/\bvotre ordinateur\b/gi, 'votre tablette'],
      [/\bl[’']ordinateur\b/gi, 'la tablette'],
    ],
  },
};

/**
 * Says "this phone" / « ce téléphone » instead of "this computer" on phones and tablets.
 * General statements ("works on any computer") are left alone.
 */
export function forDevice(text: string, lang: 'en' | 'fr', kind: DeviceKind): string {
  if (kind === 'computer') return text;
  let out = text;
  for (const [re, word] of WORDS[lang][kind]) {
    out = out.replace(re, (match, ...groups) => {
      const replaced = typeof groups[0] === 'string' ? word.replace('$1', groups[0]) : word;
      // Keep a leading capital ("Cet ordinateur" → "Ce téléphone").
      return /^\p{Lu}/u.test(match) ? replaced.charAt(0).toUpperCase() + replaced.slice(1) : replaced;
    });
  }
  return out;
}
