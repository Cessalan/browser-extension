// Builds the blog as plain HTML pages (fast, readable by search engines without JavaScript),
// plus the sitemap and robots.txt. Runs after `vite build`, writing into dist/.
// French articles live at /blog/<slug>/, English ones at /en/blog/<slug>/.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const SITE = 'https://confi.ca';
const SRC = 'content/blog';
const OUT = 'dist';

const T = {
  fr: {
    blog: 'Blogue',
    blogTitle: 'Blogue Confi : écrire avec l’IA sans exposer vos renseignements',
    blogDescription: 'Conseils pour corriger, réécrire et traduire des textes confidentiels avec l’IA, sans que vos données quittent votre ordinateur.',
    cta: 'Essayer Confi',
    read: 'Lire l’article',
    other: 'Read in English',
    footer: 'Confi corrige et réécrit vos textes avec l’IA, directement sur votre ordinateur. Rien n’est envoyé.',
    date: (d) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
  },
  en: {
    blog: 'Blog',
    blogTitle: 'Confi blog: writing with AI without exposing private information',
    blogDescription: 'How to fix, rewrite and translate confidential text with AI, without your data leaving your computer.',
    cta: 'Try Confi',
    read: 'Read the article',
    other: 'Lire en français',
    footer: 'Confi fixes and rewrites your text with AI, right on your computer. Nothing is sent anywhere.',
    date: (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
  },
};

const blogPath = (lang) => (lang === 'fr' ? '/blog/' : '/en/blog/');
const postPath = (p) => `${blogPath(p.lang)}${p.slug}/`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Front matter between --- lines: `key: value` or `key: "value"`. */
function parse(file) {
  const raw = readFileSync(join(SRC, file), 'utf8');
  const [, head, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw) ?? [];
  if (!head) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(
    head.split('\n').map((line) => {
      const [, k, v] = /^(\w+):\s*(.*)$/.exec(line);
      return [k, v.replace(/^"(.*)"$/, '$1')];
    }),
  );
  for (const k of ['title', 'description', 'lang', 'slug', 'date']) if (!meta[k]) throw new Error(`${file}: missing ${k}`);
  return { ...meta, html: marked.parse(body) };
}

const CSS = `
:root{--brand:#0278b8;--brand-strong:#02679e;--brand-soft:#e0f2fe;--canvas:#f0f9ff;--ink:#0f172a;--muted:#64748b;--line:#dbe7f3}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--canvas);color:var(--ink);font:17px/1.7 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--brand)}a:hover{color:var(--brand-strong)}
header{background:#fff;border-bottom:1px solid var(--line)}
.bar{max-width:880px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:14px}
.logo{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-weight:600;font-size:18px}
.logo img{width:30px;height:30px}
.bar nav{margin-left:auto;display:flex;align-items:center;gap:16px;font-size:15px}
.bar nav a{text-decoration:none;color:var(--muted)}.bar nav a:hover{color:var(--ink)}
.btn{display:inline-block;background:var(--brand);color:#fff!important;text-decoration:none;font-weight:600;padding:9px 16px;border-radius:10px}
.btn:hover{background:var(--brand-strong)}
main{max-width:760px;margin:0 auto;padding:40px 20px 64px}
article,.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:40px clamp(20px,5vw,48px);box-shadow:0 1px 2px rgb(15 23 42/.04),0 12px 32px -18px rgb(15 23 42/.18)}
h1{font-size:clamp(28px,4.5vw,38px);line-height:1.2;letter-spacing:-.02em;margin:0 0 12px}
h2{font-size:23px;line-height:1.3;margin:36px 0 10px;letter-spacing:-.01em}
.meta{color:var(--muted);font-size:14px;margin:0 0 28px}
article p,article li{color:#1e293b}article ul,article ol{padding-left:1.3em}article li{margin:6px 0}
article p:last-child a[href="/"]{display:inline-block;margin-top:12px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px}
.list{display:grid;gap:16px}.card{padding:24px 28px;display:block;text-decoration:none;color:inherit}
.card h2{margin:0 0 6px;font-size:21px;color:var(--ink)}.card p{margin:0;color:var(--muted);font-size:16px}
.card .more{display:inline-block;margin-top:10px;color:var(--brand);font-weight:600;font-size:15px}
.intro{color:var(--muted);margin:0 0 28px;font-size:18px}
footer{max-width:760px;margin:0 auto;padding:0 20px 48px;color:var(--muted);font-size:14px}
`;

function page({ lang, title, description, path, body, alternate, jsonLd }) {
  const t = T[lang];
  const alt = alternate
    ? `<link rel="alternate" hreflang="${lang}" href="${SITE}${path}">\n<link rel="alternate" hreflang="${alternate.lang}" href="${SITE}${alternate.path}">`
    : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
${alt}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/icon-512.png">
<meta property="og:locale" content="${lang === 'fr' ? 'fr_CA' : 'en_CA'}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png?v=3" type="image/png" sizes="32x32">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>${CSS}</style>
</head>
<body>
<header><div class="bar">
<a class="logo" href="/"><img src="/icon.svg" alt="">Confi</a>
<nav><a href="${blogPath(lang)}">${t.blog}</a>${alternate ? `<a href="${alternate.path}" hreflang="${alternate.lang}">${T[lang].other}</a>` : `<a href="${blogPath(lang === 'fr' ? 'en' : 'fr')}" hreflang="${lang === 'fr' ? 'en' : 'fr'}">${lang === 'fr' ? 'English' : 'Français'}</a>`}<a class="btn" href="/">${t.cta}</a></nav>
</div></header>
<main>${body}</main>
<footer>${t.footer}</footer>
</body>
</html>
`;
}

function write(path, html) {
  const dir = join(OUT, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

const posts = readdirSync(SRC)
  .filter((f) => f.endsWith('.md'))
  .map(parse)
  .sort((a, b) => b.date.localeCompare(a.date));
const bySlug = new Map(posts.map((p) => [p.slug, p]));

for (const p of posts) {
  const other = p.alternate && bySlug.get(p.alternate);
  write(
    postPath(p),
    page({
      lang: p.lang,
      title: `${p.title} | Confi`,
      description: p.description,
      path: postPath(p),
      alternate: other && { lang: other.lang, path: postPath(other) },
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: p.title,
        description: p.description,
        datePublished: p.date,
        inLanguage: p.lang === 'fr' ? 'fr-CA' : 'en-CA',
        mainEntityOfPage: `${SITE}${postPath(p)}`,
        publisher: { '@type': 'Organization', name: 'Confi', url: SITE, logo: `${SITE}/icon-512.png` },
      },
      body: `<article><h1>${esc(p.title)}</h1><p class="meta">${T[p.lang].date(p.date)}</p>${p.html}</article>`,
    }),
  );
}

for (const lang of ['fr', 'en']) {
  const t = T[lang];
  const list = posts
    .filter((p) => p.lang === lang)
    .map((p) => `<a class="card" href="${postPath(p)}"><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><span class="more">${t.read} →</span></a>`)
    .join('\n');
  write(
    blogPath(lang),
    page({
      lang,
      title: t.blogTitle,
      description: t.blogDescription,
      path: blogPath(lang),
      alternate: { lang: lang === 'fr' ? 'en' : 'fr', path: blogPath(lang === 'fr' ? 'en' : 'fr') },
      body: `<h1>${t.blog}</h1><p class="intro">${esc(t.blogDescription)}</p><div class="list">${list}</div>`,
    }),
  );
}

const urls = ['/', '/correcteur/', '/en/french-grammar-checker/', '/blog/', '/en/blog/', ...posts.map(postPath)];
writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${SITE}${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Blog: ${posts.length} articles, ${urls.length} URLs in the sitemap.`);
