// Where translations come from. Settings stay in this browser only.
//  - "default": used every time the page opens (DuckDuckGo unless the person
//    picks another one as their default).
//  - "in use": what this visit uses; picking a source changes it, and it
//    goes back to the default the next time the page is opened.
import { siGoogle, siDuckduckgo, siLibretranslate, siOllama, siFirefoxbrowser } from 'simple-icons';
import { nameOf } from './languages.js';

/* ---------------- Logos (white, one colour) ---------------- */
const pathIcon = (d) => `<svg class="src-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
const letterIcon = (letters, size = 13) => `<svg class="src-logo" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><text x="12" y="16.6" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-weight="700" font-size="${size}" fill="currentColor">${letters}</text></svg>`;
// Google's logo with a "forbidden" sign over it, for Google reached privately.
const googleBlocked = `<svg class="src-logo" viewBox="0 0 24 24" aria-hidden="true">`
  + `<g transform="translate(4.2 4.2) scale(0.65)"><path fill="currentColor" d="${siGoogle.path}"/></g>`
  + `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>`
  + `<path d="M5 5 L19 19" style="stroke: var(--surface0)" stroke-width="4.5" stroke-linecap="round"/>`
  + `<path d="M5 5 L19 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const LOGOS = {
  google: pathIcon(siGoogle.path),
  googleBlocked,
  mozilla: pathIcon(siFirefoxbrowser.path),
  duckduckgo: pathIcon(siDuckduckgo.path),
  libre: pathIcon(siLibretranslate.path),
  ollama: pathIcon(siOllama.path),
  mymemory: letterIcon('MM', 10),
  apertium: letterIcon('Ap', 11),
};
export const logoFor = (provider) => LOGOS[provider.logo] || letterIcon(provider.name[0]);

/* ---------------- The list ---------------- */
const MOZHI_FIELD = {
  key: 'url', label: 'Privacy server (Mozhi)', shared: 'mozhi', default: 'https://mozhi.adminforge.de',
  options: ['https://mozhi.adminforge.de', 'https://mozhi.ducks.party', 'https://mozhi.pussthecat.org'],
};

export const PROVIDER_GROUPS = [
  {
    title: 'Offline',
    providers: [
      {
        id: 'mozilla', name: 'Mozilla Translations', logo: 'mozilla', privacy: 'Fully private',
        note: 'The translator built into Firefox, running right here in the page. Your text never leaves your device. English ↔ Japanese is built in. Other languages are downloaded from Mozilla the first time (about 20–60 MB each); Mozilla’s server only sends them to Firefox and Safari. It can’t detect languages well: pick the source language yourself (Latin-script text is treated as English).',
      },
    ],
  },
  {
    title: 'Online',
    providers: [
      {
        id: 'google', name: 'Google', logo: 'google', privacy: 'Not private',
        note: 'Best quality and every language. Google sees the text you translate and who sent it. If it fails, MyMemory is tried instead.',
      },
      {
        id: 'mozhi:google', name: 'Google, privately', logo: 'googleBlocked', privacy: 'Hides you from Google',
        note: 'Google’s translations, fetched for you by a Mozhi privacy server, so Google doesn’t see who you are. The Mozhi server sees your text.',
        fields: [MOZHI_FIELD],
      },
      {
        id: 'mozhi:duckduckgo', name: 'DuckDuckGo', logo: 'duckduckgo', privacy: 'Hides you',
        note: 'DuckDuckGo’s translator (powered by Microsoft), fetched through a Mozhi privacy server. Good quality, many languages.',
        fields: [MOZHI_FIELD],
      },
      {
        id: 'mozhi:mymemory', name: 'MyMemory', logo: 'mymemory', privacy: 'Hides you',
        note: 'Translation memory by Translated, fetched through a Mozhi privacy server. Fine for short texts; it can’t detect the language reliably.',
        fields: [MOZHI_FIELD],
      },
      {
        id: 'mozhi:libre', name: 'LibreTranslate (public)', logo: 'libre', privacy: 'Open source',
        note: 'The open-source LibreTranslate, run by others and reached through a Mozhi privacy server. Quality is a step below Google.',
        fields: [MOZHI_FIELD],
      },
      {
        id: 'apertium', name: 'Apertium', logo: 'apertium', privacy: 'Open source, non-profit',
        note: 'Free, open-source translator run by volunteers. Mostly European languages: it can’t translate Japanese or Chinese.',
      },
    ],
  },
  {
    title: 'Self-hosted',
    providers: [
      {
        id: 'libre', name: 'LibreTranslate Self-hosted', logo: 'libre', privacy: 'Fully private',
        note: 'Run the open-source LibreTranslate on this computer. Your text goes only to it.',
        fields: [
          { key: 'url', label: 'Server address', placeholder: 'http://localhost:5000', default: 'http://localhost:5000' },
          { key: 'apiKey', label: 'API key (only if the server needs one)', placeholder: 'optional', default: '', secret: true },
        ],
      },
      {
        id: 'ollama', name: 'Local AI (Ollama)', logo: 'ollama', privacy: 'Fully private',
        note: 'An AI model on this computer with the free Ollama app. Nothing leaves your computer. Good quality with a strong model (Qwen 2.5 is good at Japanese), but slower.',
        fields: [
          { key: 'url', label: 'Ollama address', placeholder: 'http://localhost:11434', default: 'http://localhost:11434' },
          { key: 'model', label: 'Model', placeholder: 'qwen2.5:7b', default: 'qwen2.5:7b' },
        ],
      },
    ],
  },
];
export const PROVIDERS = PROVIDER_GROUPS.flatMap((g) => g.providers);
const byId = (id) => PROVIDERS.find((p) => p.id === id);

/* ---------------- Settings ---------------- */
const STORE_KEY = 'tr.provider';
const DEFAULT_SOURCE = 'mozhi:duckduckgo';
const SETTINGS_VERSION = 2; // 2: DuckDuckGo became the default
const SESSION_KEY = 'tr.provider.inUse';

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}

export function getProviderSettings() {
  const saved = readStore();
  const current = saved.v === SETTINGS_VERSION;
  const settings = { defaultId: current && byId(saved.defaultId) ? saved.defaultId : DEFAULT_SOURCE, fields: {} };
  for (const p of PROVIDERS) {
    for (const f of p.fields || []) {
      const key = (f.shared || p.id) + '.' + f.key;
      settings.fields[key] = saved.fields?.[key] ?? f.default;
    }
  }
  let inUse = null;
  try { inUse = sessionStorage.getItem(SESSION_KEY); } catch { /* blocked */ }
  settings.id = byId(inUse) ? inUse : settings.defaultId;
  return settings;
}

function writeStore(settings) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: SETTINGS_VERSION, defaultId: settings.defaultId, fields: settings.fields })); } catch { /* blocked */ }
}

export const fieldKey = (provider, field) => (field.shared || provider.id) + '.' + field.key;

/** Use a source for this visit. */
export function useProvider(id) {
  try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* blocked */ }
}

/** Make a source the default for every visit (and use it now). */
export function setDefaultProvider(id) {
  const s = getProviderSettings();
  s.defaultId = id;
  writeStore(s);
  useProvider(id);
}

export function setProviderField(provider, field, value) {
  const s = getProviderSettings();
  s.fields[fieldKey(provider, field)] = value;
  writeStore(s);
}

/** Colour of a privacy tag: green private, red not private, purple hides you, blue open source. */
export function privacyTone(text) {
  const t = text.toLowerCase();
  if (t.startsWith('fully private')) return 'green';
  if (t.startsWith('not private')) return 'red';
  if (t.startsWith('hides you')) return 'purple';
  if (t.includes('open source') || t.includes('non-profit')) return 'blue';
  return '';
}

export const providerName = (id) => byId(id)?.name || id;

/* ---------------- Network helpers ---------------- */
const trimSlash = (u) => String(u || '').trim().replace(/\/+$/, '');

class ProviderError extends Error {}
export const isProviderError = (err) => err instanceof ProviderError;

async function request(url, init, what) {
  let res;
  try { res = await fetch(url, init); }
  catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(`Couldn’t reach ${what}. Check that it’s running and the address is right, or pick another source.`);
  }
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }
  const cap = what.charAt(0).toUpperCase() + what.slice(1);
  if (!res.ok || data === null) {
    const why = data?.error || data?.explanation || (raw && raw.length < 200 && !raw.startsWith('<') ? raw.trim() : '');
    throw new ProviderError(why ? `${cap}: ${why}` : `${cap} answered with an error (${res.status}). Try again or pick another source.`);
  }
  return data;
}

/* ---------------- Google (direct) ---------------- */
async function viaGoogle(text, sl, tl, signal) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const out = (data[0] || []).map((s) => (s && s[0]) || '').join('');
  return { text: out, detected: typeof data[2] === 'string' ? data[2] : null };
}

async function viaMyMemory(text, sl, tl, signal) {
  const map = (c) => ({ iw: 'he', jw: 'jv' }[c] || c);
  const pair = `${sl === 'auto' ? 'Autodetect' : map(sl)}|${map(tl)}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${encodeURIComponent(pair)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const det = data?.responseData?.detectedLanguage;
  return { text: data?.responseData?.translatedText || '', detected: typeof det === 'string' ? det.split('-')[0] : null };
}

async function google(text, sl, tl, signal) {
  try { return await viaGoogle(text, sl, tl, signal); }
  catch (err) {
    if (err.name === 'AbortError') throw err;
    return viaMyMemory(text, sl, tl, signal);
  }
}

/* ---------------- Mozhi privacy servers ---------------- */
const MOZHI_CODE = {
  google: {},
  duckduckgo: { iw: 'he', jw: 'jv', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', no: 'nb', tl: 'fil' },
  mymemory: { iw: 'he', jw: 'jv' },
  libre: { iw: 'he', 'zh-CN': 'zh', 'zh-TW': 'zt', jw: 'jv', no: 'nb' },
};
const MOZHI_BACK = { he: 'iw', jv: 'jw', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', zh: 'zh-CN', zt: 'zh-TW', nb: 'no', fil: 'tl' };

async function mozhi(engine, text, sl, tl, signal, fields) {
  const base = trimSlash(fields['mozhi.url']);
  const map = MOZHI_CODE[engine] || {};
  const from = sl === 'auto' ? 'auto' : (map[sl] || sl);
  const to = map[tl] || tl;
  const url = `${base}/api/translate?engine=${engine}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&text=${encodeURIComponent(text)}`;
  const data = await request(url, { signal }, `the privacy server (${base.replace(/^https?:\/\//, '')})`);
  const det = data?.detected;
  return { text: data?.['translated-text'] ?? '', detected: det ? (MOZHI_BACK[det] || det) : null };
}

/* ---------------- Apertium ---------------- */
const APERTIUM = {
  en: 'eng', es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', ca: 'cat', nl: 'nld', af: 'afr', ar: 'ara',
  eu: 'eus', gl: 'glg', ro: 'ron', ru: 'rus', uk: 'ukr', be: 'bel', pl: 'pol', cs: 'ces', sk: 'slk', sv: 'swe',
  da: 'dan', no: 'nob', is: 'isl', cy: 'cym', ga: 'gle', eo: 'epo', mt: 'mlt', kk: 'kaz', tt: 'tat', ky: 'kir',
  sq: 'sqi', bg: 'bul', mk: 'mkd', sr: 'srp', hr: 'hrv', bs: 'bos', sl: 'slv', hi: 'hin', ur: 'urd', id: 'ind',
  ms: 'msa', tr: 'tur', fi: 'fin', et: 'est', lt: 'lit', lv: 'lav', hu: 'hun', el: 'ell', iw: 'heb', fa: 'fas',
  sd: 'snd', co: 'cos', lb: 'ltz', fy: 'fry', gd: 'gla', uz: 'uzb', tg: 'tgk', az: 'aze',
};
const APERTIUM_BACK = Object.fromEntries(Object.entries(APERTIUM).map(([k, v]) => [v, k]));

async function apertium(text, sl, tl, signal) {
  const base = 'https://apertium.org/apy';
  let from = sl;
  if (sl === 'auto') {
    const guess = await request(`${base}/identifyLang?q=${encodeURIComponent(text)}`, { signal }, 'Apertium');
    const best = Object.entries(guess || {}).sort((a, b) => b[1] - a[1])[0];
    from = best ? (APERTIUM_BACK[best[0]] || best[0]) : 'en';
  }
  const a = APERTIUM[from];
  const b = APERTIUM[tl];
  if (!a || !b) throw new ProviderError(`Apertium can’t translate ${nameOf(from)} to ${nameOf(tl)}. It mostly covers European languages; pick another source.`);
  try {
    const data = await request(`${base}/translate?langpair=${a}%7C${b}&q=${encodeURIComponent(text)}&markUnknown=no`, { signal }, 'Apertium');
    return { text: data?.responseData?.translatedText ?? '', detected: sl === 'auto' ? from : null };
  } catch (err) {
    if (isProviderError(err) && /not installed|pair/i.test(err.message)) {
      throw new ProviderError(`Apertium can’t translate ${nameOf(from)} to ${nameOf(tl)}. It mostly covers European languages; pick another source.`);
    }
    throw err;
  }
}

/* ---------------- LibreTranslate on this computer ---------------- */
const LIBRE_CODE = { iw: 'he', 'zh-CN': 'zh', 'zh-TW': 'zt', jw: 'jv', no: 'nb' };
const LIBRE_BACK = { he: 'iw', zh: 'zh-CN', zt: 'zh-TW', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', jv: 'jw', nb: 'no' };

async function libre(text, sl, tl, signal, fields) {
  const base = trimSlash(fields['libre.url']);
  if (!base) throw new ProviderError('Add your LibreTranslate server address under Source.');
  const body = { q: text, source: sl === 'auto' ? 'auto' : (LIBRE_CODE[sl] || sl), target: LIBRE_CODE[tl] || tl, format: 'text' };
  if (fields['libre.apiKey']) body.api_key = fields['libre.apiKey'];
  const data = await request(`${base}/translate`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, 'your LibreTranslate server');
  const det = data?.detectedLanguage?.language;
  return { text: data?.translatedText ?? '', detected: det ? (LIBRE_BACK[det] || det) : null };
}

/* ---------------- Local AI (Ollama) ---------------- */
async function ollama(text, sl, tl, signal, fields) {
  const base = trimSlash(fields['ollama.url']);
  const from = sl === 'auto' ? 'the language it is written in' : nameOf(sl);
  const prompt = `Translate the text between the markers from ${from} into ${nameOf(tl)}. `
    + 'Reply with only the translation, keeping line breaks, with no notes or quotes.\n'
    + `<<<\n${text}\n>>>`;
  const data = await request(`${base}/api/generate`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: fields['ollama.model'] || 'qwen2.5:7b', prompt, stream: false, options: { temperature: 0.2 } }),
  }, 'Ollama');
  const out = String(data?.response ?? '').replace(/^\s*<<<\s*|\s*>>>\s*$/g, '').trim();
  return { text: out, detected: null };
}

/* ---------------- Mozilla Translations (in the page) ---------------- */
const MOZ_CODE = { 'zh-CN': 'zh', 'zh-TW': 'zt', iw: 'he', no: 'nb', tl: 'tl' };
const MOZ_BACK = { zh: 'zh-CN', zt: 'zh-TW', he: 'iw', nb: 'no' };
let mozTranslator;
let mozPairs;
async function mozillaTranslator(first) {
  if (!mozTranslator) {
    mozTranslator = (async () => {
      const { LatencyOptimisedTranslator } = await import(/* @vite-ignore */ new URL('bergamot/translator.js', document.baseURI).href);
      const registryUrl = new URL('bergamot/registry.json', document.baseURI).href;
      mozPairs = fetch(registryUrl).then((r) => r.json()).then((reg) => new Set(Object.keys(reg)));
      // The first request is the language pair to start loading straight away.
      return new LatencyOptimisedTranslator(first, { registryUrl, pivotLanguage: 'en', downloadTimeout: 0 });
    })();
    mozTranslator.catch(() => { mozTranslator = null; });
  }
  return mozTranslator;
}

// Mozilla's translator has no language detection: guess from the alphabet.
function guessLanguage(text) {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[\u0590-\u05ff]/.test(text)) return 'iw';
  if (/[\u0370-\u03ff]/.test(text)) return 'el';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  return 'en';
}

async function mozilla(text, sl, tl, signal) {
  const from = sl === 'auto' ? guessLanguage(text) : sl;
  if (from === tl) return { text, detected: sl === 'auto' ? from : null };
  const a = MOZ_CODE[from] || from;
  const b = MOZ_CODE[tl] || tl;
  const translator = await mozillaTranslator({ from: a, to: b });
  const pairs = await mozPairs;
  const direct = pairs.has(a + b);
  const viaEnglish = pairs.has(a + 'en') && pairs.has('en' + b);
  if (!direct && !viaEnglish) {
    throw new ProviderError(`Mozilla Translations can’t translate ${nameOf(from)} to ${nameOf(tl)} yet. Pick another source.`);
  }
  try {
    const r = await translator.translate({ from: a, to: b, text, html: false }, { signal });
    return { text: r.target.text, detected: sl === 'auto' ? (MOZ_BACK[a] || from) : null };
  } catch (err) {
    if (signal?.aborted || ['SupersededError', 'CancelledError'].includes(err?.constructor?.name)) {
      const e = new Error('aborted'); e.name = 'AbortError'; throw e;
    }
    throw new ProviderError(`Mozilla Translations couldn’t load the ${nameOf(from)}–${nameOf(tl)} model. English ↔ Japanese is built in; other languages are downloaded from Mozilla, whose server only sends them to Firefox and Safari.`);
  }
}

/** Translate with the source in use. Throws ProviderError with a readable message. */
export async function translateText(text, sl, tl, signal) {
  if (sl === tl) return { text, detected: null };
  const s = getProviderSettings();
  const id = s.id;
  if (id.startsWith('mozhi:')) return mozhi(id.slice(6), text, sl, tl, signal, s.fields);
  if (id === 'apertium') return apertium(text, sl, tl, signal);
  if (id === 'mozilla') return mozilla(text, sl, tl, signal);
  if (id === 'libre') return libre(text, sl, tl, signal, s.fields);
  if (id === 'ollama') return ollama(text, sl, tl, signal, s.fields);
  return google(text, sl, tl, signal);
}
