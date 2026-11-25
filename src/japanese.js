// Offline helpers for Japanese translations: hiragana readings (kuromoji,
// served from this site) and English meanings per kanji (KANJIDIC table).

const HAN = /\p{Script=Han}/u;
const NOT_A_KANJI = new Set(['々', '〆', '〇', 'ヶ']);

export const isKanji = (ch) => HAN.test(ch) && !NOT_A_KANJI.has(ch);
export const hasKanji = (text) => [...text].some(isKanji);

// Katakana -> hiragana (the long-vowel mark ー stays as it is).
export const toHiragana = (s) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

let tokenizerPromise;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(s);
  });
}

export function loadTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      // Works on the page and in the background speech worker (no document there).
      const base = globalThis.__ttsBase || document.baseURI;
      if (!globalThis.kuromoji) {
        if (typeof document === 'undefined') await import(/* @vite-ignore */ new URL('kuromoji/kuromoji.js', base).href);
        else await loadScript(new URL('kuromoji/kuromoji.js', base).href);
      }
      return new Promise((resolve, reject) => {
        // kuromoji joins paths in a way that breaks full addresses ("http://" loses a
        // slash), so give it the path on this site, which works on the page and in the worker.
        globalThis.kuromoji.builder({ dicPath: new URL('kuromoji/dict/', base).pathname }).build((err, tokenizer) => {
          if (err) reject(err); else resolve(tokenizer);
        });
      });
    })();
    tokenizerPromise.catch(() => { tokenizerPromise = null; });
  }
  return tokenizerPromise;
}

let meaningsPromise;
export function loadMeanings() {
  if (!meaningsPromise) {
    meaningsPromise = import('./generated/kanji-meanings.json').then((m) => m.default || m);
    meaningsPromise.catch(() => { meaningsPromise = null; });
  }
  return meaningsPromise;
}

// The whole text written in hiragana.
export async function readingOf(text) {
  const tokenizer = await loadTokenizer();
  return tokenizer
    .tokenize(text)
    .map((t) => {
      const r = t.reading && t.reading !== '*' ? t.reading : null;
      return toHiragana(hasKanji(t.surface_form) && r ? r : t.surface_form);
    })
    .join('');
}

// The text as it is spoken, in hiragana: like readingOf, but the particles
// は, へ and を become わ, え and お, as they are pronounced.
export async function spokenKana(text) {
  const tokenizer = await loadTokenizer();
  const PARTICLE = { 'ハ': 'わ', 'ヘ': 'え', 'ヲ': 'お' };
  return tokenizer
    .tokenize(text)
    .map((t) => {
      if (t.pos === '助詞' && PARTICLE[t.reading]) return PARTICLE[t.reading];
      const r = t.reading && t.reading !== '*' ? t.reading : null;
      return toHiragana(r || t.surface_form);
    })
    .join('');
}

// Each different kanji in the text, in order, with its meanings.
export async function kanjiMeanings(text) {
  const table = await loadMeanings();
  const seen = new Set();
  const out = [];
  for (const ch of text) {
    if (!isKanji(ch) || seen.has(ch)) continue;
    seen.add(ch);
    out.push({ kanji: ch, meanings: table[ch] || [] });
  }
  return out;
}
