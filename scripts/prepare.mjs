// Runs before the build. Prepares the offline Japanese helpers so nothing
// has to be fetched from another website:
//  1. a compact kanji -> English meanings table from KANJIDIC (via kanji.js),
//  2. the kuromoji reading analyzer and its dictionary, copied into public/.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// 1. Kanji meanings (first three meanings per character).
const kanjiPkg = dirname(require.resolve('kanji.js/package.json'));
const Kanji = require(join(kanjiPkg, 'dist', 'kanji.js'));
const table = {};
for (const w of Kanji.dump()) {
  if (w.meanings && w.meanings.length) table[w.literal] = w.meanings.slice(0, 3);
}
mkdirSync(join(root, 'src', 'generated'), { recursive: true });
writeFileSync(join(root, 'src', 'generated', 'kanji-meanings.json'), JSON.stringify(table));

// 2. kuromoji (reading analyzer) + dictionary.
const kuroPkg = dirname(require.resolve('kuromoji/package.json'));
const out = join(root, 'public', 'kuromoji');
mkdirSync(join(out, 'dict'), { recursive: true });
let lib = readFileSync(join(kuroPkg, 'build', 'kuromoji.js'), 'utf8');
// Some servers send .gz files already unpacked; only unpack when the bytes are still gzip.
const before = 'var gz = new zlib.Zlib.Gunzip(new Uint8Array(arraybuffer));\n        var typed_array = gz.decompress();\n        callback(null, typed_array.buffer);';
const after = 'var bytes = new Uint8Array(arraybuffer);\n        if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) { callback(null, arraybuffer); return; }\n        var gz = new zlib.Zlib.Gunzip(bytes);\n        var typed_array = gz.decompress();\n        callback(null, typed_array.buffer);';
if (!lib.includes(before)) throw new Error('kuromoji loader changed; update scripts/prepare.mjs');
lib = lib.replace(before, after);
writeFileSync(join(out, 'kuromoji.js'), lib);
for (const f of readdirSync(join(kuroPkg, 'dict'))) {
  const dest = join(out, 'dict', f);
  if (!existsSync(dest)) copyFileSync(join(kuroPkg, 'dict', f), dest);
}
// 3. eSpeak NG (offline text-to-speech) + the list of voices it has.
const espeakDist = join(dirname(require.resolve('espeak-ng/package.json')), 'dist');
const espeakOut = join(root, 'public', 'espeak');
mkdirSync(espeakOut, { recursive: true });
for (const f of ['espeak-ng.js', 'espeak-ng.wasm']) copyFileSync(join(espeakDist, f), join(espeakOut, f));
const { default: ESpeakNg } = await import(pathToFileURL(join(espeakDist, 'espeak-ng.js')).href);
let listing = '';
await ESpeakNg({ arguments: ['--voices'], print: (t) => { listing += t + '\n'; }, printErr() {} });
// Map every language code (and its short form) to the voice that speaks it.
const voices = {};
for (const line of listing.split('\n').slice(1)) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) continue;
  const lang = parts[1];
  const codes = [lang, lang.toLowerCase(), lang.split('-')[0].toLowerCase()];
  for (const m of line.matchAll(/\(([^\s)]+) \d+\)/g)) codes.push(m[1].toLowerCase());
  for (const c of codes) if (!(c in voices)) voices[c] = lang;
}
writeFileSync(join(root, 'src', 'generated', 'espeak-voices.json'), JSON.stringify(voices));

// 4. Piper Plus (natural neural voice for ja/en/zh/es/fr/pt), served as plain
//    files from this site: the library, its phonemizer, ONNX Runtime, and the
//    CSS10 voice model (public-domain recordings). The model is downloaded once
//    while building; the finished site never contacts any model host.
const piperOut = join(root, 'public', 'piper');
const piperPkg = join(root, 'node_modules', 'piper-plus');
const g2pReal = join(root, 'node_modules', '@piper-plus', 'g2p');
const ortDist = join(root, 'node_modules', 'onnxruntime-web', 'dist');

function copyTree(from, to, transform) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dest, transform);
    else if (transform && entry.name.endsWith('.js')) writeFileSync(dest, transform(readFileSync(src, 'utf8'), dest));
    else copyFileSync(src, dest);
  }
}
// The library imports its phonemizer by package name; point it at the copied files.
const g2pSrcOut = join(piperOut, 'g2p', 'src');
const rewrite = (code, dest) => code.replace(/(["'])@piper-plus\/g2p(\/[a-z-]+)?\1/g, (_m, q, sub) => {
  const target = join(g2pSrcOut, sub ? `${sub.slice(1)}/index.js` : 'index.js');
  let rel = relative(dirname(dest), target).split('\\').join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return q + rel + q;
});
copyTree(join(piperPkg, 'src'), join(piperOut, 'piper-plus', 'src'), rewrite);
copyTree(join(piperPkg, 'dist', 'rust-wasm'), join(piperOut, 'piper-plus', 'dist', 'rust-wasm'));
copyTree(join(piperPkg, 'assets'), join(piperOut, 'piper-plus', 'assets'));
copyTree(join(g2pReal, 'src'), g2pSrcOut);
copyTree(join(g2pReal, 'data'), join(piperOut, 'g2p', 'data'));
mkdirSync(join(piperOut, 'ort'), { recursive: true });
for (const f of ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(ortDist, f), join(piperOut, 'ort', f));

// Download a file once while building (skipped when it is already there).
async function downloadOnce(fromUrl, dest) {
  if (existsSync(dest) && statSync(dest).size > 0) return;
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`downloading ${fromUrl.split('/').slice(-2).join('/')} (one time only)...`);
  const res = await fetch(fromUrl);
  if (!res.ok) throw new Error(`Could not download ${fromUrl}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

const voiceDir = join(piperOut, 'voice');
const HF = 'https://huggingface.co/';
const css10 = HF + 'ayousanz/piper-plus-css10-ja-6lang/resolve/main/';
await downloadOnce(css10 + 'config.json', join(voiceDir, 'css10-ja-6lang-fp16.onnx.json'));
await downloadOnce(css10 + 'css10-ja-6lang-fp16.onnx', join(voiceDir, 'css10-ja-6lang-fp16.onnx'));
const tsukuyomi = HF + 'ayousanz/piper-plus-tsukuyomi-chan/resolve/main/';
await downloadOnce(tsukuyomi + 'config.json', join(voiceDir, 'tsukuyomi-chan-6lang-fp16.onnx.json'));
await downloadOnce(tsukuyomi + 'tsukuyomi-chan-6lang-fp16.onnx', join(voiceDir, 'tsukuyomi-chan-6lang-fp16.onnx'));

// 5. Kokoro-82M (natural voices for Japanese and English) via kokoro-js-jp.
//    Its browser bundle normally fetches the model, the voices and ONNX Runtime
//    from other websites; those three addresses are pointed at this site.
const kokoroPkg = join(root, 'node_modules', 'kokoro-js-jp', 'dist');
const kokoroOut = join(root, 'public', 'kokoro');
mkdirSync(kokoroOut, { recursive: true });
let kokoroLib = readFileSync(join(kokoroPkg, 'kokoro-jp.web.js'), 'utf8');
const local = (p) => `\${new URL(${JSON.stringify(p)},globalThis.__ttsBase||document.baseURI).href}`;
const patches = [
  ['`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${n.env.version}/dist/`', '`' + local('kokoro/ort/') + '`'],
  ['remoteHost:"https://huggingface.co/"', 'remoteHost:new URL("kokoro/models/",globalThis.__ttsBase||document.baseURI).href'],
  ['`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${e}.bin`', '`' + local('kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/') + '${e}.bin`'],
];
for (const [from, to] of patches) {
  if (!kokoroLib.includes(from)) throw new Error('kokoro-js-jp changed; update scripts/prepare.mjs: ' + from);
  kokoroLib = kokoroLib.split(from).join(to);
}
writeFileSync(join(kokoroOut, 'kokoro-jp.web.js'), kokoroLib);
// Japanese front end (Open JTalk) files, kept in the layout the library expects.
const jpOut = join(kokoroOut, 'jp');
copyTree(join(kokoroPkg, 'browser'), join(jpOut, 'browser'));
for (const f of readdirSync(kokoroPkg)) {
  if (f.startsWith('openjtalk-') || f === 'open_jtalk_dic_utf_8-1.11.tar.gz') copyFileSync(join(kokoroPkg, f), join(jpOut, f));
}
// ONNX Runtime build that transformers.js expects.
const tfDist = join(root, 'node_modules', '@huggingface', 'transformers', 'dist');
mkdirSync(join(kokoroOut, 'ort'), { recursive: true });
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) copyFileSync(join(tfDist, f), join(kokoroOut, 'ort', f));
// The model and the voices offered in the voice menu.
const kokoroRepo = HF + 'onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
const kokoroLocal = join(kokoroOut, 'models', 'onnx-community', 'Kokoro-82M-v1.0-ONNX', 'resolve', 'main');
for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']) {
  await downloadOnce(kokoroRepo + f, join(kokoroLocal, ...f.split('/')));
}
const KOKORO_VOICES = ['jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo', 'af_heart', 'af_bella', 'am_michael', 'bf_emma', 'bm_george'];
for (const v of KOKORO_VOICES) await downloadOnce(`${kokoroRepo}voices/${v}.bin`, join(kokoroLocal, 'voices', `${v}.bin`));

// 6. Mozilla's offline translator (Firefox Translations / Bergamot). The
//    translator runs in the page; each language model is downloaded from
//    Mozilla's model server the first time it's needed (the text never leaves
//    the device). The list of models is made here, while building, so the
//    finished site doesn't ask Mozilla's settings service for it.
const bergamotPkg = join(root, 'node_modules', '@mkljczk', 'bergamot-translator');
const bergamotOut = join(root, 'public', 'bergamot');
mkdirSync(join(bergamotOut, 'worker'), { recursive: true });
copyFileSync(join(bergamotPkg, 'translator.js'), join(bergamotOut, 'translator.js'));
for (const f of ['translator-worker.js', 'bergamot-translator-worker.js', 'bergamot-translator-worker.wasm']) {
  copyFileSync(join(bergamotPkg, 'worker', f), join(bergamotOut, 'worker', f));
}
const registryFile = join(bergamotOut, 'registry.json');
if (!existsSync(join(bergamotOut, 'registry-remote.json'))) {
  console.log('fetching the list of Mozilla translation models (one time only)...');
  const res = await fetch('https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records');
  if (!res.ok) throw new Error('Could not fetch the Mozilla model list: ' + res.status);
  const records = (await res.json()).data;
  const ver = (v) => v.replace(/a(\d+)/, '.-1.$1').split('.').map(Number);
  const cmp = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = x[i] ?? 0, q = y[i] ?? 0; if (p !== q) return p - q; } return 0; };
  // Models meant for desktop release builds (not Android-only or nightly-only).
  const desktop = (f) => !f || /!= 'Android'/.test(f) || (!/== 'Android'/.test(f) && !/channel ==/.test(f));
  // The translator reads two-letter codes from the registry keys.
  const short = { 'zh-Hans': 'zh', 'zh-Hant': 'zt' };
  const byPair = {};
  for (const r of records) {
    if (!desktop(r.filter_expression)) continue;
    const from = short[r.fromLang] || r.fromLang;
    const to = short[r.toLang] || r.toLang;
    if (from.length !== 2 || to.length !== 2) continue;
    ((byPair[from + to] ??= {})[r.version] ??= {})[r.fileType] = r;
  }
  const registry = {};
  for (const [pair, versions] of Object.entries(byPair)) {
    const usable = Object.keys(versions).filter((v) => versions[v].model).sort(cmp);
    if (!usable.length) continue;
    const files = versions[usable[usable.length - 1]];
    registry[pair] = Object.fromEntries(Object.entries(files).map(([type, r]) => [type, {
      name: 'https://firefox-settings-attachments.cdn.mozilla.net/' + r.attachment.location,
      size: r.attachment.size,
      expectedSha256Hash: r.attachment.hash,
    }]));
  }
  writeFileSync(join(bergamotOut, 'registry-remote.json'), JSON.stringify(registry));
  console.log(`Mozilla models: ${Object.keys(registry).length} language pairs`);
}
// Mozilla's model server refuses Chrome-based browsers, so the English <->
// Japanese models are kept on this site; other pairs come from Mozilla.
{
  const remote = JSON.parse(readFileSync(join(bergamotOut, 'registry-remote.json'), 'utf8'));
  const local = structuredClone(remote);
  for (const pair of ['enja', 'jaen']) {
    for (const [type, file] of Object.entries(local[pair] || {})) {
      const ext = file.name.split('.').pop();
      const rel = `bergamot/models/${pair}/${type}.${ext}`;
      await downloadOnce(file.name, join(root, 'public', ...rel.split('/')));
      file.name = rel;
    }
  }
  writeFileSync(registryFile, JSON.stringify(local));
}

// 7. Japanese typing: a reading -> words table for turning hiragana into kanji
//    (and katakana loanwords), made from JMdict's common words (EDRDG,
//    CC BY-SA 4.0, via jmdict-simplified), plus single kanji by reading from
//    KANJIDIC. Downloaded once while building.
{
  const imeFile = join(root, 'src', 'generated', 'ime-dict.json');
  const cacheDir = join(root, '.cache');
  const tgz = join(cacheDir, 'jmdict-eng-common.json.tgz');
  if (!existsSync(tgz)) {
    const rel = await (await fetch('https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest')).json();
    const asset = (rel.assets || []).find((a) => /^jmdict-eng-common-.*\.json\.tgz$/.test(a.name));
    if (!asset) throw new Error('Could not find the JMdict download');
    await downloadOnce(asset.browser_download_url, tgz);
  }
  // Unpack the single JSON file inside the .tgz (gzip + tar).
  const { gunzipSync } = await import('node:zlib');
  const tar = gunzipSync(readFileSync(tgz));
  const size = parseInt(tar.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim(), 8);
  const jmdict = JSON.parse(tar.subarray(512, 512 + size).toString('utf8'));

  // kuromoji's dictionary gives each word a cost: lower means more common.
  const kuroTokenizer = await new Promise((resolve, reject) => {
    require('kuromoji').builder({ dicPath: join(kuroPkg, 'dict') + '/' }).build((err, t) => (err ? reject(err) : resolve(t)));
  });
  const costBuffer = kuroTokenizer.token_info_dictionary.dictionary;
  const wordCost = (text) => {
    const toks = kuroTokenizer.tokenize(text);
    if (toks.length === 1 && toks[0].word_type === 'KNOWN') return costBuffer.getShort(toks[0].word_id + 4);
    return 9000 + 500 * toks.length;
  };
  const kanaToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const freqOf = {};
  for (const w of Kanji.dump()) if (w.freq) freqOf[w.literal] = w.freq;
  const rarity = (text) => {
    const ks = [...text].filter((c) => /\p{Script=Han}/u.test(c));
    return ks.length ? ks.reduce((a, c) => a + (freqOf[c] || 3000), 0) / ks.length : 0;
  };
  const scored = {}; // reading -> Map(text -> score)
  const add = (reading, text, score) => {
    const key = kanaToHira(reading);
    if (!key || key === text) return;
    const m = (scored[key] ??= new Map());
    if (!m.has(text) || m.get(text) > score) m.set(text, score);
  };
  const kanaWords = new Set(); // words usually written in kana (です, ありがとう...)
  for (const word of jmdict.words) {
    const usuallyKana = word.kanji.length === 0 || word.sense.some((sn) => (sn.misc || []).includes('uk'));
    if (usuallyKana) for (const kana of word.kana) if ((kana.common || word.kanji.length === 0) && /^[ぁ-ゖー]+$/.test(kana.text)) kanaWords.add(kana.text);
    for (const kana of word.kana) {
      const applies = (k) => kana.appliesToKanji.includes('*') || kana.appliesToKanji.includes(k.text);
      const forms = word.kanji.filter(applies);
      // Rare, old or irregular kanji spellings come after the usual ones.
      const odd = (k) => (k.tags || []).some((t) => ['rK', 'ateji', 'iK', 'oK', 'sK'].includes(t));
      // Order by how common the word is (the analyser's word cost), then rare spellings last.
      for (const k of forms) add(kana.text, k.text, wordCost(k.text) + (k.common && kana.common ? 0 : 3000) + (odd(k) ? 6000 : 0) + rarity(k.text) / 100);
      // Katakana words (loanwords) are offered for their hiragana spelling.
      if (/^[ァ-ヶー・]+$/.test(kana.text)) add(kana.text, kana.text, wordCost(kana.text) + (kana.common ? 0 : 3000));
    }
  }
  const words = {};
  for (const [key, m] of Object.entries(scored)) {
    words[key] = [...m.entries()].sort((a, b) => a[1] - b[1]).slice(0, 12).map(([t]) => t);
  }
  // Single kanji by reading (on'yomi and the stem of kun'yomi), most common first.
  const singleScored = {};
  for (const w of Kanji.dump()) {
    if (!w.freq) continue;
    const readings = [...(w.onyomi || []), ...(w.kunyomi || []).map((r) => r.replace(/^-|-$/g, '').split('.')[0])];
    for (const r of new Set(readings.map(kanaToHira))) {
      if (r) (singleScored[r] ??= []).push([w.literal, w.freq]);
    }
  }
  const single = {};
  for (const [key, list] of Object.entries(singleScored)) {
    single[key] = list.sort((a, b) => a[1] - b[1]).slice(0, 15).map(([k]) => k).join('');
  }
  writeFileSync(imeFile, JSON.stringify({ words, single, kana: [...kanaWords].filter((k) => /^[ぁ-ゖー]+$/.test(k)) }));
  console.log(`Japanese typing: ${Object.keys(words).length} readings, ${Object.keys(single).length} single-kanji readings`);
}

// 8. Handwriting: KanjiCanvas (MIT) and its stroke patterns (from KanjiVG,
//    CC BY-SA 3.0), served from this site and loaded when "Draw" is opened.
{
  const kc = 'https://raw.githubusercontent.com/asdfjkl/kanjicanvas/master/docs/resources/javascript/';
  for (const f of ['kanji-canvas.js', 'ref-patterns.js']) {
    await downloadOnce(kc + f, join(root, 'public', 'kanjicanvas', f));
  }
}

console.log(`prepared ${Object.keys(table).length} kanji meanings, the reading dictionary and ${new Set(Object.values(voices)).size} offline voices`);
