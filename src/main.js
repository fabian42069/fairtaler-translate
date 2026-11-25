import './offline.js';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import './style.css';
import { LANGUAGES, nameOf } from './languages.js';
import { speak, stop as stopSpeech, prepare as prepareSpeech, warmUp, VOICE_GROUPS, getChoices, setChoice } from './speech.js';
import { icon } from './icons.js';
import { hasKanji, readingOf, kanjiMeanings } from './japanese.js';
import { createIme } from './ime.js';
import { createDraw } from './draw.js';
import { PROVIDER_GROUPS, privacyTone, getProviderSettings, useProvider, setDefaultProvider, setProviderField, fieldKey, logoFor, providerName, translateText, isProviderError } from './providers.js';

const $ = (id) => document.getElementById(id);
const MAX = 5000;

/* ---------------- Storage ---------------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('tr.' + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem('tr.' + key, JSON.stringify(value)); } catch { /* full or blocked */ } },
};

/* ---------------- State ---------------- */
const params = new URLSearchParams(location.search);
const valid = (c) => c === 'auto' || LANGUAGES.some(([k]) => k === c);

const state = {
  sl: valid(params.get('sl')) ? params.get('sl') : store.get('sl', 'en'),
  tl: valid(params.get('tl')) && params.get('tl') !== 'auto' ? params.get('tl') : store.get('tl', 'ja'),
  srcRecent: store.get('srcRecent', ['en', 'es', 'fr']),
  tgtRecent: store.get('tgtRecent', ['ja', 'es', 'en']),
  detected: null,
  result: '',
  resultFor: null, // { text, sl, tl } the result belongs to
  picker: null, // 'src' | 'tgt' | null
  pickerFocus: 0,
  history: store.get('history', []),
  historyOn: store.get('historyOn', false), // off until the person turns it on
  saved: store.get('saved', []),
  drawer: null, // 'history' | 'saved' | null
};

/* ---------------- Elements ---------------- */
const el = {
  source: $('source'), output: $('output'), count: $('count'), clear: $('clear'),
  srcSide: $('src-side'), tgtSide: $('tgt-side'), swap: $('swap'),
  picker: $('picker'), pickerBody: $('picker-body'), pickerSearch: $('picker-search'),
  pickerBack: $('picker-back'), pickerClear: $('picker-clear'), panes: $('panes'),
  listenSrc: $('listen-src'), listenTgt: $('listen-tgt'), copy: $('copy'),
  save: $('save'), info: $('info'), infoPop: $('info-pop'), infoClose: $('info-close'), infoEmpty: $('info-empty'), infoTitle: $('info-title'), jpCredit: $('jp-credit'), jpExtra: $('jp-extra'), jpReading: $('jp-reading'), jpKanji: $('jp-kanji'), tgtFoot: $('tgt-foot'),
  drawer: $('drawer'), historySwitch: $('history-switch'), scrim: $('scrim'), drawerTitle: $('drawer-title'),
  drawerList: $('drawer-list'), drawerTools: $('drawer-tools'), drawerClose: $('drawer-close'),
  toast: $('toast'),
};

/* ---------------- Static icons ---------------- */
el.info.innerHTML = icon('info');
el.infoClose.innerHTML = icon('close');
el.swap.innerHTML = icon('swap');
el.clear.innerHTML = icon('close');
el.listenSrc.innerHTML = icon('volume');
el.listenTgt.innerHTML = icon('volume');
el.copy.innerHTML = icon('copy');
el.pickerBack.innerHTML = icon('back');
el.pickerClear.innerHTML = icon('close');
el.drawerClose.innerHTML = icon('close');
document.querySelectorAll('[data-icon]').forEach((n) => { n.innerHTML = icon(n.dataset.icon); });

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-shown'), 2600);
}

/* ---------------- Language bar ---------------- */
function pushRecent(list, code) {
  const next = [code, ...list.filter((c) => c !== code)].slice(0, 3);
  return next;
}

function effectiveSource() {
  return state.sl === 'auto' ? state.detected : state.sl;
}

function tab(code, label, active, side) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lang-tab' + (active ? ' is-active' : '');
  b.textContent = label;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-selected', String(active));
  b.addEventListener('click', () => chooseLanguage(side, code));
  return b;
}

function moreButton(side) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn lang-more' + (state.picker === side ? ' is-open' : '');
  b.innerHTML = icon('expand');
  b.setAttribute('aria-label', side === 'src' ? 'More source languages' : 'More target languages');
  b.setAttribute('aria-expanded', String(state.picker === side));
  b.addEventListener('click', () => togglePicker(side));
  return b;
}

function selectButton(side, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lang-select';
  b.innerHTML = `<span></span>${icon('expand')}`;
  b.firstChild.textContent = label;
  b.setAttribute('aria-label', (side === 'src' ? 'Source language: ' : 'Target language: ') + label);
  b.addEventListener('click', () => togglePicker(side));
  return b;
}

function detectLabel() {
  return state.sl === 'auto' && state.detected ? `${nameOf(state.detected)} - Detected` : 'Detect language';
}

const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 500));
let warmTimer;
let lastTypedAt = 0;
function scheduleWarmUp() {
  clearTimeout(warmTimer);
  // Load the voices for the chosen languages in the background, target first,
  // but never while the person is typing.
  const wait = Math.max(800, lastTypedAt + 1000 - Date.now());
  warmTimer = setTimeout(() => idle(() => {
    if (Date.now() - lastTypedAt < 1000) { scheduleWarmUp(); return; }
    warmUp(state.tl);
    const src = effectiveSource();
    if (src && src !== state.tl) warmUp(src);
  }), wait);
}

function renderLangbar() {
  scheduleWarmUp();
  updateJapaneseTools();
  const src = el.srcSide;
  src.replaceChildren();
  src.setAttribute('role', 'tablist');
  src.append(tab('auto', detectLabel(), state.sl === 'auto', 'src'));
  for (const c of state.srcRecent) src.append(tab(c, nameOf(c), state.sl === c, 'src'));
  src.append(moreButton('src'));
  src.append(selectButton('src', state.sl === 'auto' ? detectLabel() : nameOf(state.sl)));

  const tgt = el.tgtSide;
  tgt.replaceChildren();
  tgt.setAttribute('role', 'tablist');
  for (const c of state.tgtRecent) tgt.append(tab(c, nameOf(c), state.tl === c, 'tgt'));
  tgt.append(moreButton('tgt'));
  tgt.append(selectButton('tgt', nameOf(state.tl)));

  el.swap.disabled = state.sl === 'auto' && !state.detected;
}

function chooseLanguage(side, code) {
  if (side === 'src') {
    if (code === state.tl && code !== 'auto') { state.tl = effectiveSource() || pickOther(code); state.tgtRecent = pushRecent(state.tgtRecent, state.tl); }
    state.sl = code;
    if (code !== 'auto') state.srcRecent = pushRecent(state.srcRecent, code);
  } else {
    if (code === state.sl) {
      const prev = state.tl;
      state.sl = prev;
      state.srcRecent = pushRecent(state.srcRecent, prev);
    }
    state.tl = code;
    state.tgtRecent = pushRecent(state.tgtRecent, code);
  }
  if (state.sl !== 'auto') state.detected = null;
  persistLangs();
  closePicker();
  renderLangbar();
  requestTranslation(true);
}

function pickOther(code) {
  return ['en', 'es', 'fr'].find((c) => c !== code);
}

function persistLangs() {
  store.set('sl', state.sl);
  store.set('tl', state.tl);
  store.set('srcRecent', state.srcRecent);
  store.set('tgtRecent', state.tgtRecent);
}

function swap() {
  const from = effectiveSource();
  if (!from) return;
  const to = state.tl;
  const translated = state.result && state.resultFor && state.resultFor.text === el.source.value ? state.result : '';
  state.sl = to;
  state.tl = from;
  state.detected = null;
  state.srcRecent = pushRecent(state.srcRecent, to);
  state.tgtRecent = pushRecent(state.tgtRecent, from);
  if (translated) {
    const old = el.source.value;
    el.source.value = translated;
    ime.commitAll();
    showResult(old, { text: translated, sl: to, tl: from });
  }
  persistLangs();
  closePicker();
  renderLangbar();
  onInput(false);
  requestTranslation(true);
}

/* ---------------- Language picker ---------------- */
function togglePicker(side) {
  if (state.picker === side) closePicker();
  else openPicker(side);
}

function openPicker(side) {
  state.picker = side;
  state.pickerFocus = 0;
  el.pickerSearch.value = '';
  el.pickerClear.hidden = true;
  el.picker.hidden = false;
  el.panes.hidden = true;
  el.picker.setAttribute('aria-label', side === 'src' ? 'Translate from' : 'Translate to');
  renderPicker();
  renderLangbar();
  // Focus the search field so typing filters straight away.
  requestAnimationFrame(() => el.pickerSearch.focus({ preventScroll: true }));
}

function closePicker() {
  if (!state.picker) return;
  state.picker = null;
  el.picker.hidden = true;
  el.panes.hidden = false;
  renderLangbar();
}

function pickerItem(code, selected) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'picker-item' + (selected ? ' is-selected' : '');
  b.dataset.code = code;
  b.innerHTML = `<span class="tick">${icon('check')}</span><span></span>`;
  b.lastChild.textContent = nameOf(code);
  b.addEventListener('click', () => chooseLanguage(state.picker, code));
  return b;
}

function section(title, codes, current) {
  const s = document.createElement('div');
  s.className = 'picker-section';
  if (title) {
    const h = document.createElement('h3');
    h.textContent = title;
    s.append(h);
  }
  const g = document.createElement('div');
  g.className = 'picker-grid';
  for (const c of codes) g.append(pickerItem(c, c === current));
  s.append(g);
  return s;
}

function renderPicker() {
  const side = state.picker;
  if (!side) return;
  const current = side === 'src' ? state.sl : state.tl;
  const q = el.pickerSearch.value.trim().toLowerCase();
  const all = LANGUAGES.map(([c]) => c);
  el.pickerBody.replaceChildren();

  if (q) {
    const pool = side === 'src' ? ['auto', ...all] : all;
    const hits = pool.filter((c) => nameOf(c).toLowerCase().includes(q) || c.toLowerCase() === q);
    if (!hits.length) {
      const p = document.createElement('div');
      p.className = 'picker-empty';
      p.textContent = 'No results';
      el.pickerBody.append(p);
      return;
    }
    el.pickerBody.append(section(null, hits, current));
  } else {
    const recent = side === 'src' ? state.srcRecent : state.tgtRecent;
    el.pickerBody.append(section('Recent languages', side === 'src' ? ['auto', ...recent] : recent, current));
    el.pickerBody.append(section('All languages', side === 'src' ? ['auto', ...all] : all, current));
  }
  markPickerFocus();
}

function pickerItems() {
  return [...el.pickerBody.querySelectorAll('.picker-item')];
}

function markPickerFocus() {
  const items = pickerItems();
  items.forEach((n, i) => n.classList.toggle('is-focused', !!el.pickerSearch.value.trim() && i === state.pickerFocus));
}

el.pickerSearch.addEventListener('input', () => {
  el.pickerClear.hidden = !el.pickerSearch.value;
  state.pickerFocus = 0;
  renderPicker();
});
el.pickerSearch.addEventListener('keydown', (e) => {
  const items = pickerItems();
  if (e.key === 'ArrowDown') { e.preventDefault(); state.pickerFocus = Math.min(items.length - 1, state.pickerFocus + 1); markPickerFocus(); items[state.pickerFocus]?.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); state.pickerFocus = Math.max(0, state.pickerFocus - 1); markPickerFocus(); items[state.pickerFocus]?.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const pick = el.pickerSearch.value.trim() ? items[state.pickerFocus] : null;
    if (pick) chooseLanguage(state.picker, pick.dataset.code);
  }
});
el.pickerClear.addEventListener('click', () => {
  el.pickerSearch.value = '';
  el.pickerClear.hidden = true;
  renderPicker();
  el.pickerSearch.focus();
});
el.pickerBack.addEventListener('click', closePicker);

/* ---------------- Translation ---------------- */
async function translate(text, sl, tl, signal) {
  return translateText(text, sl, tl, signal);
}

let debounce;
let inflight;
let seq = 0;

function requestTranslation(immediate = false) {
  clearTimeout(debounce);
  const text = el.source.value;
  if (!text.trim()) {
    inflight?.abort();
    state.detected = null;
    showResult('', null);
    renderLangbar();
    return;
  }
  if (state.result) el.output.classList.add('is-pending');
  debounce = setTimeout(run, immediate ? 0 : 350);
}

async function run() {
  const text = el.source.value;
  if (!text.trim()) return;
  const sl = state.sl;
  const tl = state.tl;
  const my = ++seq;
  inflight?.abort();
  inflight = new AbortController();
  if (!state.result) {
    el.output.className = 'output is-pending';
    el.output.textContent = 'Translating...';
  }
  try {
    const r = await translate(text, sl, tl, inflight.signal);
    if (my !== seq) return;
    if (sl === 'auto') {
      state.detected = r.detected && r.detected !== 'auto' ? r.detected : null;
      renderLangbar();
    }
    showResult(r.text, { text, sl, tl });
    scheduleHistory();
  } catch (err) {
    if (err.name === 'AbortError' || my !== seq) return;
    state.result = '';
    state.resultFor = null;
    el.output.className = 'output is-error';
    el.output.textContent = navigator.onLine === false && !['libre', 'ollama'].includes(getProviderSettings().id)
      ? 'You appear to be offline. Connect to the internet to translate.'
      : isProviderError(err) ? err.message
      : `Translation isn’t available right now (${providerName(getProviderSettings().id)}). Please try again in a moment.`;
    el.tgtFoot.hidden = true;
    el.save.hidden = true;
    jpSeq++;
    el.jpExtra.hidden = true;
  }
}

function showResult(text, meta) {
  state.result = text;
  state.resultFor = meta;
  if (!text) {
    el.output.className = 'output is-empty';
    el.output.textContent = 'Translation';
    el.tgtFoot.hidden = true;
    el.save.hidden = true;
    closeInfo();
  } else {
    el.output.className = 'output';
    el.output.textContent = text;
    el.output.lang = meta ? meta.tl : '';
    el.tgtFoot.hidden = false;
    el.save.hidden = false;
  }
  renderJapanese(text, meta);
  schedulePrepare(text, meta);
  renderSaveButton();
  syncUrl();
}

/* ---------------- Speech made ahead of time ---------------- */
let prepareTimer;
const TYPING_PAUSE = 1000; // speech work starts only after 1 s without typing
function schedulePrepare(text, meta) {
  clearTimeout(prepareTimer);
  if (!text || !meta) { prepareSpeech('', null); return; }
  const wait = Math.max(0, lastTypedAt + TYPING_PAUSE - Date.now());
  prepareTimer = setTimeout(() => {
    // Typed again meanwhile: wait for the next pause (the newer translation reschedules).
    if (Date.now() - lastTypedAt < TYPING_PAUSE) return;
    if (state.result !== text) return;
    prepareSpeech(text, meta.tl);
  }, wait);
}

/* ---------------- Japanese: reading + kanji meanings ---------------- */
let jpSeq = 0;
async function renderJapanese(text, meta) {
  const my = ++jpSeq;
  const japanese = !!(text && meta && meta.tl === 'ja' && hasKanji(text));
  el.jpKanji.replaceChildren();
  renderInfo();
  if (!japanese) {
    el.jpExtra.hidden = true;
    return;
  }
  el.jpExtra.hidden = false;
  el.jpReading.textContent = 'Loading reading…';
  el.jpReading.classList.add('is-loading');

  kanjiMeanings(text).then((list) => {
    if (my !== jpSeq) return;
    el.jpKanji.replaceChildren(...list.map(({ kanji, meanings }) => {
      const li = document.createElement('li');
      const k = document.createElement('span');
      k.className = 'jp-k';
      k.lang = 'ja';
      k.textContent = kanji;
      const m = document.createElement('span');
      m.className = 'jp-m';
      m.textContent = meanings[0] || 'no meaning listed';
      li.append(k, ' - ', m);
      if (meanings.length > 1) {
        const more = document.createElement('span');
        more.className = 'jp-more';
        more.textContent = ', ' + meanings.slice(1).join(', ');
        li.append(more);
      }
      return li;
    }));
    renderInfo();
  }).catch(() => {
    if (my === jpSeq) el.jpKanji.replaceChildren();
  });

  try {
    let reading;
    try { reading = await readingOf(text); }
    catch { await new Promise((r) => setTimeout(r, 1000)); if (my !== jpSeq) return; reading = await readingOf(text); } // one quiet retry
    if (my !== jpSeq) return;
    el.jpReading.textContent = reading;
    el.jpReading.classList.remove('is-loading');
  } catch (err) {
    console.warn('reading failed', err);
    if (my !== jpSeq) return;
    el.jpReading.textContent = 'Reading isn’t available right now';
  }
}

/* ---------------- Info pop-up (lower right of the translation) ---------------- */
function renderInfo() {
  const japanese = !!(state.result && state.resultFor && state.resultFor.tl === 'ja' && hasKanji(state.result));
  el.infoTitle.textContent = japanese ? 'Kanji in this translation' : 'About this translation';
  el.jpKanji.hidden = !japanese;
  el.jpCredit.hidden = !japanese;
  el.infoEmpty.hidden = japanese;
  if (!japanese) {
    el.infoEmpty.textContent = state.resultFor && state.resultFor.tl === 'ja'
      ? 'This translation has no kanji to explain.'
      : 'When you translate into Japanese, the meaning of each kanji shows here.';
  }
}

function openInfo() {
  renderInfo();
  el.infoPop.hidden = false;
  el.info.classList.add('is-on');
  el.info.setAttribute('aria-expanded', 'true');
}

function closeInfo() {
  el.infoPop.hidden = true;
  el.info.classList.remove('is-on');
  el.info.setAttribute('aria-expanded', 'false');
}

el.info.addEventListener('click', (e) => {
  e.stopPropagation();
  if (el.infoPop.hidden) openInfo(); else closeInfo();
});
el.infoClose.addEventListener('click', closeInfo);
document.addEventListener('click', (e) => {
  if (!el.infoPop.hidden && !el.infoPop.contains(e.target) && !el.info.contains(e.target)) closeInfo();
});

/* ---------------- Source input ---------------- */
function autosize() {
  const top = el.source.scrollTop;
  el.source.style.height = 'auto';
  el.source.style.height = el.source.scrollHeight + 'px';
  el.source.scrollTop = top;
}

function onInput(translateNow = true) {
  const len = el.source.value.length;
  el.count.textContent = `${len.toLocaleString('en-US')} / 5,000`;
  el.count.classList.toggle('is-full', len >= MAX);
  el.clear.hidden = len === 0;
  el.listenSrc.hidden = len === 0;
  autosize();
  if (translateNow) requestTranslation();
}

el.source.addEventListener('input', (e) => {
  // Typing: drop speech that was waiting to be made, so it can't slow the keyboard down.
  lastTypedAt = Date.now();
  clearTimeout(prepareTimer);
  prepareSpeech('', null);
  ime.handleInput(e); // romaji -> kana when typing Japanese
  onInput();
});

/* ---------------- Japanese typing and drawing ---------------- */
const imeToggle = $('ime-toggle');
const drawBtn = $('draw-btn');
let imeOn = store.get('imeOn', true);
const ime = createIme({
  textarea: el.source,
  bar: $('ime-bar'),
  isActive: () => state.sl === 'ja' && imeOn,
  onChange: () => onInput(),
});
const draw = createDraw({
  pop: $('draw-pop'),
  canvas: $('draw-canvas'),
  candidates: $('draw-cands'),
  status: $('draw-status'),
  onPick: (ch) => {
    const v = el.source.value;
    const a = el.source.selectionStart ?? v.length;
    const b = el.source.selectionEnd ?? v.length;
    el.source.value = (v.slice(0, a) + ch + v.slice(b)).slice(0, MAX);
    const caret = Math.min(a + ch.length, el.source.value.length);
    el.source.setSelectionRange(caret, caret);
    ime.commitAll();
    onInput();
  },
});
drawBtn.innerHTML = icon('pen');
$('draw-close').innerHTML = icon('close');
$('draw-close').addEventListener('click', () => closeDraw());
$('draw-undo').addEventListener('click', () => draw.undo());
$('draw-clear').addEventListener('click', () => draw.clear());
function closeDraw() {
  draw.close();
  drawBtn.classList.remove('is-on');
  drawBtn.setAttribute('aria-expanded', 'false');
}
drawBtn.addEventListener('click', () => {
  if (draw.isOpen()) { closeDraw(); return; }
  draw.open();
  drawBtn.classList.add('is-on');
  drawBtn.setAttribute('aria-expanded', 'true');
});
function renderImeToggle() {
  imeToggle.textContent = imeOn ? 'あ' : 'A';
  imeToggle.classList.toggle('is-on', imeOn);
  imeToggle.setAttribute('aria-pressed', String(imeOn));
  imeToggle.setAttribute('aria-label', imeOn ? 'Romaji to Japanese is on' : 'Romaji to Japanese is off');
}
imeToggle.addEventListener('click', () => {
  imeOn = !imeOn;
  store.set('imeOn', imeOn);
  renderImeToggle();
  ime.refresh();
  toast(imeOn ? 'Typing romaji now writes Japanese' : 'Typing is left as it is');
  el.source.focus();
});
function updateJapaneseTools() {
  const ja = state.sl === 'ja';
  imeToggle.hidden = !ja;
  drawBtn.hidden = !ja;
  if (!ja && draw.isOpen()) closeDraw();
  if (ja) ime.preload();
  ime.refresh();
  renderImeToggle();
}
el.clear.addEventListener('click', () => {
  el.source.value = '';
  ime.commitAll();
  onInput();
  el.source.focus();
});

/* ---------------- Speech ---------------- */
async function listen(text, code, button) {
  const problem = await speak(text, code, button);
  if (problem) toast(problem);
}
el.listenSrc.addEventListener('click', () => listen(el.source.value, effectiveSource(), el.listenSrc));
el.listenTgt.addEventListener('click', () => listen(state.result, state.tl, el.listenTgt));

/* ---------------- Copy, save ---------------- */
el.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.result); toast('Translation copied'); }
  catch { toast('Couldn’t copy the translation'); }
});

function currentEntry() {
  const m = state.resultFor;
  if (!m || !state.result) return null;
  return { src: m.text, tgt: state.result, sl: m.sl === 'auto' ? (state.detected || 'auto') : m.sl, tl: m.tl };
}
const sameEntry = (a, b) => a.src === b.src && a.tl === b.tl && a.sl === b.sl;

function renderSaveButton() {
  const cur = currentEntry();
  const on = !!cur && state.saved.some((s) => sameEntry(s, cur));
  el.save.innerHTML = icon(on ? 'star' : 'starBorder');
  el.save.classList.toggle('is-on', on);
  el.save.setAttribute('aria-label', on ? 'Remove from saved' : 'Save translation');
  el.save.setAttribute('aria-pressed', String(on));
}

el.save.addEventListener('click', () => {
  const cur = currentEntry();
  if (!cur) return;
  const i = state.saved.findIndex((s) => sameEntry(s, cur));
  if (i >= 0) { state.saved.splice(i, 1); toast('Removed from saved'); }
  else { state.saved.unshift({ ...cur, at: Date.now() }); toast('Translation saved'); }
  store.set('saved', state.saved);
  renderSaveButton();
  if (state.drawer === 'saved') renderDrawer();
});

/* ---------------- History ---------------- */
let historyTimer;
function scheduleHistory() {
  clearTimeout(historyTimer);
  if (!state.historyOn) return;
  historyTimer = setTimeout(() => {
    const cur = currentEntry();
    if (!cur || !cur.src.trim()) return;
    const last = state.history[0];
    if (last && sameEntry(last, cur)) return;
    // Typing extends the previous entry instead of adding one per pause.
    if (last && last.tl === cur.tl && (cur.src.startsWith(last.src) || last.src.startsWith(cur.src)) && Date.now() - last.at < 60000) {
      state.history.shift();
    }
    state.history.unshift({ ...cur, at: Date.now() });
    state.history = state.history.slice(0, 50);
    store.set('history', state.history);
    if (state.drawer === 'history') renderDrawer();
  }, 1500);
}

/* ---------------- Drawer ---------------- */
/* Saving history is a choice: the switch next to the History title. Turning it
 * off stops new entries; what is already saved stays until it's cleared. */
function renderHistorySwitch() {
  el.historySwitch.setAttribute('aria-checked', String(state.historyOn));
  el.historySwitch.classList.toggle('is-on', state.historyOn);
}
el.historySwitch.addEventListener('click', () => {
  state.historyOn = !state.historyOn;
  store.set('historyOn', state.historyOn);
  renderHistorySwitch();
  if (!state.historyOn) clearTimeout(historyTimer);
  if (state.drawer === 'history') renderDrawer();
  toast(state.historyOn ? 'History is on: new translations are saved' : 'History is off: new translations aren’t saved');
});

function openDrawer(kind) {
  state.drawer = kind;
  el.drawerTitle.textContent = { history: 'History', saved: 'Saved', voices: 'Voices', source: 'Translation source' }[kind];
  el.historySwitch.hidden = kind !== 'history';
  renderHistorySwitch();
  el.drawer.classList.add('is-open');
  el.drawer.setAttribute('aria-hidden', 'false');
  el.scrim.hidden = false;
  renderDrawer();
  el.drawerClose.focus();
}

function closeDrawer() {
  if (state.drawer === 'voices') stopSpeech();
  state.drawer = null;
  el.drawer.classList.remove('is-open');
  el.drawer.setAttribute('aria-hidden', 'true');
  el.scrim.hidden = true;
}

function renderSource() {
  el.drawerTools.replaceChildren();
  const settings = getProviderSettings();
  const intro = document.createElement('p');
  intro.className = 'voices-intro';
  intro.textContent = 'Choose where your text is sent to be translated. Tapping a source uses it for this visit; “Make default” uses it every time you open the page. For your safety the page can only reach the services listed here and servers on this computer.';

  const sections = PROVIDER_GROUPS.map((group) => {
    const sec = document.createElement('section');
    sec.className = 'voice-group';
    const h = document.createElement('h3');
    h.textContent = group.title;
    sec.append(h);
    for (const p of group.providers) {
      const inUse = settings.id === p.id;
      const isDefault = settings.defaultId === p.id;
      const card = document.createElement('div');
      card.className = 'source-card' + (inUse ? ' is-selected' : '');
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'voice-pick';
      pick.setAttribute('role', 'radio');
      pick.setAttribute('aria-checked', String(inUse));
      pick.innerHTML = `<span class="voice-tick">${icon('check', 20)}</span><span class="src-logo-wrap">${logoFor(p)}</span><span class="voice-text"><span class="voice-name"></span><span class="source-badges"><span class="source-badge"></span></span><span class="voice-note"></span></span>`;
      pick.querySelector('.voice-name').textContent = p.name;
      pick.querySelector('.source-badge').textContent = p.privacy;
      const tone = privacyTone(p.privacy);
      if (tone) pick.querySelector('.source-badge').classList.add('tone-' + tone);
      if (isDefault) {
        const d = document.createElement('span');
        d.className = 'source-badge is-default';
        d.textContent = 'Default';
        pick.querySelector('.source-badges').prepend(d);
      }
      pick.querySelector('.voice-note').textContent = p.note;
      pick.addEventListener('click', () => {
        useProvider(p.id);
        renderSource();
        toast(`Translations now come from ${p.name}`);
        requestTranslation(true);
      });
      card.append(pick);

      if (inUse) {
        const form = document.createElement('div');
        form.className = 'source-fields';
        for (const f of p.fields || []) {
          const label = document.createElement('label');
          label.className = 'source-field';
          const span = document.createElement('span');
          span.textContent = f.label;
          let input;
          if (f.options) {
            input = document.createElement('select');
            for (const o of f.options) {
              const opt = document.createElement('option');
              opt.value = o;
              opt.textContent = o.replace(/^https?:\/\//, '');
              input.append(opt);
            }
          } else {
            input = document.createElement('input');
            input.type = f.secret ? 'password' : 'text';
            input.placeholder = f.placeholder || '';
            input.spellcheck = false;
            input.autocomplete = 'off';
          }
          input.value = settings.fields[fieldKey(p, f)] ?? '';
          input.addEventListener('change', () => {
            setProviderField(p, f, input.value.trim());
            requestTranslation(true);
          });
          label.append(span, input);
          form.append(label);
        }
        const actions = document.createElement('div');
        actions.className = 'source-actions';
        const test = document.createElement('button');
        test.type = 'button';
        test.className = 'text-btn';
        test.textContent = 'Test connection';
        test.addEventListener('click', async () => {
          test.disabled = true;
          try {
            const r = await translateText('Hello', 'en', p.id === 'apertium' ? 'es' : 'ja');
            toast(r.text ? `Works: “Hello” → “${r.text}”` : 'Connected, but no translation came back');
          } catch (err) {
            toast(isProviderError(err) ? err.message : 'Couldn’t connect');
          } finally {
            test.disabled = false;
          }
        });
        actions.append(test);
        if (!isDefault) {
          const def = document.createElement('button');
          def.type = 'button';
          def.className = 'text-btn';
          def.textContent = 'Make default';
          def.addEventListener('click', () => {
            setDefaultProvider(p.id);
            renderSource();
            toast(`${p.name} is now your default source`);
          });
          actions.append(def);
        }
        form.append(actions);
        card.append(form);
      }
      sec.append(card);
    }
    return sec;
  });
  el.drawerList.replaceChildren(intro, ...sections);
}

function renderVoices() {
  el.drawerTools.replaceChildren();
  const intro = document.createElement('p');
  intro.className = 'voices-intro';
  intro.textContent = 'All voices run on this device; nothing you listen to is sent anywhere. Press play to hear a voice, then pick the one you like. Your chosen voices load in the background, and new translations are turned into speech ahead of time (kept in memory only, never saved).';
  const choices = getChoices();
  const sections = VOICE_GROUPS.map((group) => {
    const sec = document.createElement('section');
    sec.className = 'voice-group';
    const h = document.createElement('h3');
    h.textContent = group.title;
    sec.append(h);
    for (const v of group.voices) {
      const row = document.createElement('div');
      row.className = 'voice-row' + (choices[group.key] === v.id ? ' is-selected' : '');
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'voice-pick';
      pick.setAttribute('role', 'radio');
      pick.setAttribute('aria-checked', String(choices[group.key] === v.id));
      pick.innerHTML = `<span class="voice-tick">${icon('check', 20)}</span><span class="voice-text"><span class="voice-name"></span><span class="voice-note"></span></span>`;
      pick.querySelector('.voice-name').textContent = v.name;
      pick.querySelector('.voice-note').textContent = `${v.engine} · ${v.note}`;
      pick.addEventListener('click', () => {
        setChoice(group.key, v.id);
        renderVoices();
        toast(`${group.title}: ${v.name}`);
        scheduleWarmUp();
        if (state.result && state.resultFor) schedulePrepare(state.result, state.resultFor);
      });
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'icon-btn voice-play';
      play.innerHTML = icon('play');
      play.setAttribute('aria-label', `Play a sample of ${v.name}`);
      play.addEventListener('click', async () => {
        const problem = await speak(group.sample.text, group.sample.lang, play, v.id);
        if (problem) toast(problem);
      });
      row.append(pick, play);
      sec.append(row);
    }
    return sec;
  });
  const credits = document.createElement('p');
  credits.className = 'voices-credit';
  credits.textContent = 'Voices: Kokoro-82M (Apache 2.0); Piper Plus (MIT) with the CSS10 voice and the Tsukuyomi-chan voice (credit: Piper Plus:つくよみちゃん); eSpeak NG (GPL-3.0).';
  el.drawerList.replaceChildren(intro, ...sections, credits);
}

function renderDrawer() {
  const kind = state.drawer;
  if (kind === 'voices') { renderVoices(); return; }
  if (kind === 'source') { renderSource(); return; }
  const list = kind === 'history' ? state.history : state.saved;
  el.drawerTools.replaceChildren();
  el.drawerList.replaceChildren();

  if (list.length) {
    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'text-btn';
    clearAll.textContent = kind === 'history' ? 'Clear all history' : 'Remove all saved';
    clearAll.addEventListener('click', () => {
      if (kind === 'history') { state.history = []; store.set('history', []); }
      else { state.saved = []; store.set('saved', []); renderSaveButton(); }
      renderDrawer();
    });
    el.drawerTools.append(clearAll);
  }

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'drawer-empty';
    empty.innerHTML = icon(kind === 'history' ? 'history' : 'starBorder', 48) + '<div></div>';
    empty.lastChild.textContent = kind === 'saved' ? 'No saved translations yet'
      : state.historyOn ? 'No past translations yet' : 'History is off. Turn on the switch next to the title to save new translations.';
    el.drawerList.append(empty);
    return;
  }

  list.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'entry';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.innerHTML = `<div class="entry-langs"><span></span>${icon('back', 14)}<span></span></div><div class="entry-src"></div><div class="entry-tgt"></div>`;
    const spans = row.querySelectorAll('.entry-langs span');
    spans[0].textContent = nameOf(item.sl);
    spans[1].textContent = nameOf(item.tl);
    row.querySelector('.entry-src').textContent = item.src;
    row.querySelector('.entry-tgt').textContent = item.tgt;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn entry-del';
    del.innerHTML = kind === 'history' ? icon('delete', 20) : icon('star', 20);
    if (kind === 'saved') del.classList.add('is-on');
    del.setAttribute('aria-label', kind === 'history' ? 'Remove from history' : 'Remove from saved');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      list.splice(i, 1);
      store.set(kind, list);
      if (kind === 'saved') renderSaveButton();
      renderDrawer();
    });
    row.append(del);

    const load = () => {
      state.sl = item.sl;
      state.tl = item.tl;
      if (item.sl !== 'auto') state.srcRecent = pushRecent(state.srcRecent, item.sl);
      state.tgtRecent = pushRecent(state.tgtRecent, item.tl);
      state.detected = null;
      persistLangs();
      el.source.value = item.src;
      ime.commitAll();
      showResult(item.tgt, { text: item.src, sl: item.sl, tl: item.tl });
      closeDrawer();
      closePicker();
      renderLangbar();
      onInput(false);
    };
    row.addEventListener('click', load);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(); } });
    el.drawerList.append(row);
  });
}

$('open-history').addEventListener('click', () => openDrawer('history'));
$('open-saved').addEventListener('click', () => openDrawer('saved'));
$('open-voices').addEventListener('click', () => openDrawer('voices'));
$('open-source').addEventListener('click', () => openDrawer('source'));
el.drawerClose.addEventListener('click', closeDrawer);
el.scrim.addEventListener('click', closeDrawer);


el.swap.addEventListener('click', swap);

/* ---------------- Keyboard ---------------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (draw.isOpen()) closeDraw();
    else if (!el.infoPop.hidden) closeInfo();
    else if (state.drawer) closeDrawer();
    else if (state.picker) closePicker();
  }
  if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) { e.preventDefault(); swap(); }
});

/* ---------------- Address bar ---------------- */
let urlTimer;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const p = new URLSearchParams();
    p.set('sl', state.sl);
    p.set('tl', state.tl);
    if (el.source.value) p.set('text', el.source.value);
    p.set('op', 'translate');
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }, 300);
}

/* ---------------- Start ---------------- */
if (state.sl !== 'auto' && !state.srcRecent.includes(state.sl)) state.srcRecent = pushRecent(state.srcRecent, state.sl);
if (!state.tgtRecent.includes(state.tl)) state.tgtRecent = pushRecent(state.tgtRecent, state.tl);
if (state.sl === state.tl) state.tl = pickOther(state.sl);

renderLangbar();
const initialText = params.get('text');
if (initialText) {
  el.source.value = initialText.slice(0, MAX);
  ime.commitAll();
  onInput();
} else {
  onInput(false);
}
window.addEventListener('resize', autosize);
