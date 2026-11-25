// The voice engines. They run in a background worker (speech-worker.js), so
// making speech never holds up typing or the rest of the page.
import ESPEAK_VOICES from './generated/espeak-voices.json';
import { spokenKana, toHiragana } from './japanese.js';

const PIPER_LANG = { ja: 'ja', en: 'en', es: 'es', fr: 'fr', pt: 'pt', 'zh-CN': 'zh', 'zh-TW': 'zh' };
const url = (p) => new URL(p, globalThis.__ttsBase || document.baseURI).href;

/* ---------------- Kokoro ---------------- */
let kokoroPromise;
function kokoro() {
  if (!kokoroPromise) {
    kokoroPromise = (async () => {
      const { KokoroJP } = await import(/* @vite-ignore */ url('kokoro/kokoro-jp.web.js'));
      return KokoroJP.load({ japanese: { assetsUrl: url('kokoro/jp'), dicArchiveUrl: url('kokoro/jp/open_jtalk_dic.bin') } });
    })();
    kokoroPromise.catch(() => { kokoroPromise = null; });
  }
  return kokoroPromise;
}
async function kokoroSpeech(text, voice) {
  const tts = await kokoro();
  const audio = await tts.speak(text, voice);
  return audio.toBlob();
}

/* ---------------- Piper Plus ---------------- */
const PIPER_MODELS = { tsukuyomi: 'tsukuyomi-chan-6lang-fp16.onnx', css10: 'css10-ja-6lang-fp16.onnx' };
let ortPromise;
function ort() {
  if (!ortPromise) {
    ortPromise = (async () => {
      const o = await import(/* @vite-ignore */ url('piper/ort/ort.wasm.bundle.min.mjs'));
      o.env.wasm.wasmPaths = url('piper/ort/');
      o.env.wasm.numThreads = 1;
      o.env.wasm.proxy = false;
      return o;
    })();
    ortPromise.catch(() => { ortPromise = null; });
  }
  return ortPromise;
}
const piperInstances = new Map();
function piper(model) {
  if (!piperInstances.has(model)) {
    const p = (async () => {
      const [o, { PiperPlus }] = await Promise.all([ort(), import(/* @vite-ignore */ url('piper/piper-plus/src/index.js'))]);
      return PiperPlus.initialize({
        model: url('piper/voice/' + PIPER_MODELS[model]),
        ort: o,
        showModelNotice: false,
        wasmG2pUrl: url('piper/piper-plus/dist/rust-wasm/piper_plus_wasm.js'),
      });
    })();
    p.catch(() => piperInstances.delete(model));
    piperInstances.set(model, p);
  }
  return piperInstances.get(model);
}
async function piperSpeech(text, lang, model) {
  const tts = await piper(model);
  const result = await tts.synthesize(text, { language: lang });
  return result.toBlob();
}

/* ---------------- eSpeak NG ---------------- */
const ALIAS = {
  iw: 'he', jw: 'jv', 'zh-CN': 'cmn', 'zh-TW': 'cmn', no: 'nb', tl: 'fil',
  'mni-Mtei': 'mni', ckb: 'ku', gom: 'kok', ak: 'tw',
};
export function espeakVoiceName(code) {
  const tries = [ALIAS[code], code, code.toLowerCase(), code.split('-')[0].toLowerCase()];
  for (const t of tries) if (t && ESPEAK_VOICES[t]) return ESPEAK_VOICES[t];
  return null;
}
let espeakPromise;
function espeak() {
  if (!espeakPromise) {
    espeakPromise = (async () => {
      const wasmUrl = url('espeak/espeak-ng.wasm');
      const compile = WebAssembly.compileStreaming
        ? WebAssembly.compileStreaming(fetch(wasmUrl)).catch(async () =>
            WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer()))
        : fetch(wasmUrl).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b));
      const [mod, wasm] = await Promise.all([import(/* @vite-ignore */ url('espeak/espeak-ng.js')), compile]);
      return { factory: mod.default, wasm };
    })();
    espeakPromise.catch(() => { espeakPromise = null; });
  }
  return espeakPromise;
}
async function espeakSpeech(text, code) {
  const voice = espeakVoiceName(code);
  if (!voice) throw new Error('no voice');
  const say = voice === 'ja' ? await spokenKana(text).catch(() => toHiragana(text)) : text;
  const { factory, wasm } = await espeak();
  const es = await factory({
    arguments: ['-v', voice, '-s', '160', '-w', 'out.wav', '-f', 'in.txt'],
    preRun: [(M) => M.FS.writeFile('in.txt', say)],
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(wasm, imports).then((inst) => done(inst, wasm));
      return {};
    },
    locateFile: (p) => url('espeak/' + p),
    print() {},
    printErr() {},
  });
  return new Blob([es.FS.readFile('out.wav')], { type: 'audio/wav' });
}

export async function synthesizeWith(engine, text, code) {
  try {
    if (engine.kind === 'kokoro') return await kokoroSpeech(text, engine.voice);
    if (engine.kind === 'piper') return await piperSpeech(text, engine.lang, engine.model);
  } catch (err) {
    console.warn('That voice could not start; using eSpeak instead', err);
  }
  return espeakSpeech(text, code);
}

