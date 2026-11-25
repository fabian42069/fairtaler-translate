// Read text aloud fully offline. Every engine and voice below is served from
// this site; nothing contacts another website. The browser's own voices are
// not used, because some of them (e.g. Chrome's "Google" voices) send text online.
//
// Engines:
//  - Kokoro-82M (via kokoro-js-jp): natural Japanese and English voices.
//  - Piper Plus: neural voices for Japanese, English, Chinese, Spanish, French
//    and Portuguese.
//  - eSpeak NG: small robotic voice for every other language, and the fallback.
// The Japanese front ends of Kokoro and Piper (Open JTalk) say the particles
// は/へ/を as "wa"/"e"/"o"; for eSpeak the text is turned into spoken kana first.
import { espeakVoiceName } from './speech-engines.js';


/* ---------------- Voice menu ---------------- */
const KOKORO_CREDIT = 'Kokoro-82M (Apache 2.0)';
const TSUKUYOMI_CREDIT = 'Piper Plus:つくよみちゃん';
const piperVoices = [
  { id: 'piper:tsukuyomi', name: 'Tsukuyomi-chan', engine: 'Piper Plus', note: 'Female, anime style', credit: TSUKUYOMI_CREDIT },
  { id: 'piper:css10', name: 'CSS10', engine: 'Piper Plus', note: 'Female, the earlier voice' },
];
const espeakVoice = { id: 'espeak', name: 'eSpeak', engine: 'eSpeak NG', note: 'Robotic, works for almost every language' };

export const VOICE_GROUPS = [
  {
    key: 'ja', title: 'Japanese',
    sample: { text: 'こんにちは。私は学生です。駅へ行きます。', lang: 'ja' },
    voices: [
      { id: 'kokoro:jf_alpha', name: 'Alpha', engine: 'Kokoro', note: 'Female', credit: KOKORO_CREDIT },
      { id: 'kokoro:jf_gongitsune', name: 'Gongitsune', engine: 'Kokoro', note: 'Female', credit: KOKORO_CREDIT },
      { id: 'kokoro:jf_nezumi', name: 'Nezumi', engine: 'Kokoro', note: 'Female', credit: KOKORO_CREDIT },
      { id: 'kokoro:jf_tebukuro', name: 'Tebukuro', engine: 'Kokoro', note: 'Female', credit: KOKORO_CREDIT },
      { id: 'kokoro:jm_kumo', name: 'Kumo', engine: 'Kokoro', note: 'Male', credit: KOKORO_CREDIT },
      ...piperVoices, espeakVoice,
    ],
  },
  {
    key: 'en', title: 'English',
    sample: { text: 'Hello! This is how I sound when I read your translations aloud.', lang: 'en' },
    voices: [
      { id: 'kokoro:af_heart', name: 'Heart', engine: 'Kokoro', note: 'American, female', credit: KOKORO_CREDIT },
      { id: 'kokoro:af_bella', name: 'Bella', engine: 'Kokoro', note: 'American, female', credit: KOKORO_CREDIT },
      { id: 'kokoro:am_michael', name: 'Michael', engine: 'Kokoro', note: 'American, male', credit: KOKORO_CREDIT },
      { id: 'kokoro:bf_emma', name: 'Emma', engine: 'Kokoro', note: 'British, female', credit: KOKORO_CREDIT },
      { id: 'kokoro:bm_george', name: 'George', engine: 'Kokoro', note: 'British, male', credit: KOKORO_CREDIT },
      ...piperVoices, espeakVoice,
    ],
  },
  {
    key: 'other', title: 'Chinese, Spanish, French and Portuguese',
    sample: { text: 'Hola, así es como sueno cuando leo tus traducciones.', lang: 'es' },
    voices: [...piperVoices, espeakVoice],
  },
];

const DEFAULTS = { ja: 'kokoro:jf_alpha', en: 'kokoro:af_heart', other: 'piper:tsukuyomi' };
const STORE_KEY = 'tr.voices';

export function getChoices() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function setChoice(group, voiceId) {
  const next = { ...getChoices(), [group]: voiceId };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
}

const GROUP_OF = { ja: 'ja', en: 'en', 'zh-CN': 'other', 'zh-TW': 'other', es: 'other', fr: 'other', pt: 'other' };
const PIPER_LANG = { ja: 'ja', en: 'en', es: 'es', fr: 'fr', pt: 'pt', 'zh-CN': 'zh', 'zh-TW': 'zh' };

function voiceForLanguage(code) {
  const group = GROUP_OF[code];
  return group ? getChoices()[group] : 'espeak';
}

/* ---------------- Choosing an engine ---------------- */
export function hasVoice(code) {
  return !!(GROUP_OF[code] || espeakVoiceName(code));
}

const langOf = (code) => (code && code !== 'auto' ? code : 'en');

function engineFor(code, voiceId) {
  const id = voiceId || voiceForLanguage(code);
  if (id.startsWith('kokoro:') && (code === 'ja' || code === 'en')) return { kind: 'kokoro', id, voice: id.slice(7) };
  if (id.startsWith('piper:') && PIPER_LANG[code]) return { kind: 'piper', id, model: id.slice(6), lang: PIPER_LANG[code] };
  return { kind: 'espeak', id: 'espeak' };
}

/* ---------------- Background worker ----------------
 * All speech is made in a worker. When the person starts typing while the
 * worker is still making speech for an old translation, the worker is stopped
 * at once (and started again when needed), so nothing competes with typing.
 */
let worker = null;
let msgSeq = 0;
const waiting = new Map(); // id -> { resolve, reject }

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./speech-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, buffer, type, error } = e.data;
      const w = waiting.get(id);
      if (!w) return;
      waiting.delete(id);
      if (ok) w.resolve(new Blob([buffer], { type: type || 'audio/wav' }));
      else w.reject(new Error(error || 'speech failed'));
    };
    worker.onerror = () => {
      for (const w of waiting.values()) w.reject(new Error('speech worker stopped'));
      waiting.clear();
      worker = null;
    };
  }
  return worker;
}

function stopWorker() {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const w of waiting.values()) w.reject(new Error('stale'));
  waiting.clear();
  warmed.clear(); // the voices must be loaded again in the new worker
}

function synthesizeWith(engine, text, code) {
  return new Promise((resolve, reject) => {
    const id = ++msgSeq;
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, base: document.baseURI, engine, text, code });
  });
}

/* ---------------- Sentences ---------------- */
// Speech starts after the first sentence is ready, while the rest is made.
export function splitSentences(text) {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?。！？…\n]+[.!?。！？…]*["'」』）)]*\s*|[.!?。！？…]+/g) || [];
  const out = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    // Very short pieces ("Hi.") are joined to the next one so they don't sound clipped.
    if (out.length && out[out.length - 1].length < 12) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

/* ---------------- Work queue (memory only) ----------------
 * Speech made in advance is kept in memory for this visit only, never written
 * to disk or browser storage; it is gone when the page is closed or reloaded.
 */
const MAX_CLIPS = 40;
const clips = new Map(); // key -> Promise<Blob>
const tasks = []; // { key, run, priority, generation, resolve, reject }
let working = false;
let running = null; // the task the worker is busy with
let generation = 0;

const clipKey = (engine, code, sentence) => `${engine.id}|${code}|${sentence}`;

function remember(key, promise) {
  clips.delete(key);
  clips.set(key, promise);
  while (clips.size > MAX_CLIPS) clips.delete(clips.keys().next().value);
  promise.catch(() => clips.delete(key));
}

async function pump() {
  if (working) return;
  working = true;
  while (tasks.length) {
    tasks.sort((a, b) => b.priority - a.priority);
    const t = tasks.shift();
    // Work prepared for text that has since been replaced is skipped.
    if (t.priority === 0 && t.generation !== generation) { t.reject(new Error('stale')); continue; }
    running = t;
    try { t.resolve(await t.run()); } catch (err) { t.reject(err); }
    running = null;
  }
  working = false;
}

function clip(engine, code, sentence, priority) {
  const key = clipKey(engine, code, sentence);
  const known = clips.get(key);
  if (known) {
    // Already queued in the background: move it to the front if it is now wanted.
    const queued = tasks.find((t) => t.key === key);
    if (queued && priority > queued.priority) queued.priority = priority;
    return known;
  }
  const promise = new Promise((resolve, reject) => {
    tasks.push({ key, run: () => synthesizeWith(engine, sentence, code), priority, generation, resolve, reject });
  });
  remember(key, promise);
  pump();
  return promise;
}

/** Make the speech for a new translation in the background, so play starts at once. */
export function prepare(text, code) {
  generation++;
  // Speech for an old translation that is still being made: stop it right away.
  if (running && running.priority === 0) stopWorker();
  const lang = langOf(code);
  if (!text || !text.trim() || !hasVoice(lang)) return;
  const engine = engineFor(lang);
  splitSentences(text).slice(0, 12).forEach((s) => clip(engine, lang, s, 0).catch(() => {}));
}

/** Load the chosen voice for a language ahead of time (runs a tiny warm-up). */
const warmed = new Set();
export function warmUp(code) {
  const lang = langOf(code);
  if (!hasVoice(lang)) return;
  const engine = engineFor(lang);
  const key = engine.id + '|' + lang;
  if (warmed.has(key)) return;
  warmed.add(key);
  const sample = { ja: 'あ', 'zh-CN': '好', 'zh-TW': '好' }[lang] || 'Hi';
  const task = new Promise((resolve, reject) => {
    tasks.push({ key: 'warm|' + key, run: () => synthesizeWith(engine, sample, lang), priority: 0.5, generation, resolve, reject });
  });
  task.catch(() => warmed.delete(key));
  pump();
}

/* ---------------- Player ---------------- */
let current = null; // { button, audio, url, token }
let tokenSeq = 0;

export function stop() {
  if (!current) return;
  const { button, audio, url: blobUrl } = current;
  if (audio) { audio.pause(); audio.removeAttribute('src'); }
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  button?.classList.remove('is-on', 'is-loading');
  button?.setAttribute('aria-pressed', 'false');
  current = null;
}

function playBlob(blob, token) {
  return new Promise((resolve, reject) => {
    if (!current || current.token !== token) { resolve(false); return; }
    if (current.url) URL.revokeObjectURL(current.url);
    const blobUrl = URL.createObjectURL(blob);
    const audio = current.audio || new Audio();
    current.audio = audio;
    current.url = blobUrl;
    audio.onended = () => resolve(true);
    audio.onerror = () => reject(new Error('playback failed'));
    audio.src = blobUrl;
    audio.play().catch(reject);
  });
}

/**
 * Speak `text` in language `code` (with `voiceId`, or the voice chosen for that
 * language); pressing the same button again stops it.
 * Resolves with null, or a message to show the person.
 */
export async function speak(text, code, button, voiceId) {
  if (current && current.button === button) { stop(); return null; }
  stop();
  if (!text || !text.trim()) return null;
  const lang = langOf(code);
  if (!hasVoice(lang)) return 'No offline voice is available for this language';

  const engine = engineFor(lang, voiceId);
  const sentences = splitSentences(text);
  const token = ++tokenSeq;
  current = { button, token };
  button?.classList.add('is-on', 'is-loading');
  button?.setAttribute('aria-pressed', 'true');
  try {
    for (let i = 0; i < sentences.length; i++) {
      if (!current || current.token !== token) return null;
      const blob = await clip(engine, lang, sentences[i], 2);
      // Start making the next sentence while this one plays.
      if (i + 1 < sentences.length) clip(engine, lang, sentences[i + 1], 1).catch(() => {});
      if (!current || current.token !== token) return null;
      button?.classList.remove('is-loading');
      const played = await playBlob(blob, token);
      if (!played) return null;
    }
    if (current && current.token === token) stop();
    return null;
  } catch {
    if (current && current.token === token) stop();
    return 'Couldn’t read this aloud';
  }
}
