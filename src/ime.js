// Japanese typing in the source box: romaji becomes hiragana as you type
// (capital letters give katakana), and a bar suggests kanji, katakana and
// words for the hiragana you just typed. Space or Enter takes the first
// suggestion, Escape keeps the text as it is. Everything runs offline.
import { toKana, toKatakana } from 'wanakana';

const HIRA = /[ぁ-ゖー]/;
let dictPromise;
const dict = () => (dictPromise ??= import('./generated/ime-dict.json').then((m) => m.default || m));

// Particles stay in hiragana when a sentence is converted.
const PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'や', 'か', 'ね', 'よ', 'な', 'から', 'まで', 'より', 'けど', 'って']);
let kanaSetCache;
const learned = new Map();
const kanaSetOf = (d) => (kanaSetCache ??= new Set(d.kana || []));

/**
 * Split hiragana into words with the fewest pieces (dynamic programming) and
 * write each with its usual spelling. Unknown characters stay as they are.
 */
function segment(text, d, kanaSet) {
  const n = text.length;
  const best = new Array(n + 1).fill(null);
  best[0] = { cost: 0, out: '' };
  for (let i = 0; i < n; i++) {
    if (!best[i]) continue;
    for (let j = i + 1; j <= Math.min(n, i + 12); j++) {
      const piece = text.slice(i, j);
      let cost = null;
      let out = piece;
      if (PARTICLES.has(piece)) cost = 0.9;
      else if (kanaSet.has(piece)) cost = 1;
      else if (d.words[piece]) { cost = 1; out = d.words[piece][0]; }
      else if (j === i + 1) cost = 2.5; // a lone character nothing knows
      if (cost === null) continue;
      const c = best[i].cost + cost;
      if (!best[j] || c < best[j].cost) best[j] = { cost: c, out: best[i].out + out };
    }
  }
  return best[n]?.out || null;
}

export function createIme({ textarea, bar, isActive, onChange }) {
  let committedUpTo = textarea.value.length;
  let candidates = []; // { text, len } — len: how many typed kana it replaces
  let compStart = 0;
  let renderSeq = 0;

  const active = () => isActive();

  /** The hiragana typed since the last choice, ending at the cursor. */
  function composition() {
    const pos = textarea.selectionStart;
    if (pos !== textarea.selectionEnd) return null;
    const before = textarea.value.slice(0, pos);
    let start = pos;
    while (start > committedUpTo && start > 0 && HIRA.test(before[start - 1])) start--;
    if (start === pos) return null;
    return { start, text: before.slice(start, pos) };
  }

  async function suggest() {
    const my = ++renderSeq;
    const comp = active() ? composition() : null;
    if (!comp) { hide(); return; }
    const d = await dict();
    if (my !== renderSeq) return;
    const list = [];
    const seen = new Set();
    const push = (text, len) => { if (!seen.has(text)) { seen.add(text); list.push({ text, len }); } };
    const kana = comp.text;
    // What was picked for this reading earlier in this visit comes first (kept in memory only).
    if (learned.has(kana)) push(learned.get(kana), kana.length);
    const whole = d.words[kana] || [];
    const kanaSet = kanaSetOf(d);
    if (kanaSet.has(kana)) push(kana, kana.length); // usually written in kana
    for (const w of whole) push(w, kana.length);
    // A sentence: split it into words, keep particles in kana.
    const sentence = segment(kana, d, kanaSet);
    if (sentence && sentence !== kana && !seen.has(sentence)) {
      if (whole.length || kanaSet.has(kana)) list.splice(1, 0, { text: sentence, len: kana.length });
      else list.unshift({ text: sentence, len: kana.length });
      seen.add(sentence);
    }
    for (const k of d.single[kana] || '') push(k, kana.length);
    // Also offer words for the longest start of it, to convert step by step.
    if (!whole.length) {
      for (let n = kana.length - 1; n >= 1; n--) {
        const part = kana.slice(0, n);
        const words = d.words[part] || [];
        if (words.length) { words.forEach((w) => push(w, n)); (d.single[part] || '').split('').slice(0, 4).forEach((k) => push(k, n)); break; }
      }
    }
    push(toKatakana(kana), kana.length);
    push(kana, kana.length);
    candidates = list.slice(0, 14);
    compStart = comp.start;
    render(kana);
  }

  function render(kana) {
    bar.replaceChildren();
    candidates.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ime-cand' + (i === 0 ? ' is-first' : '');
      b.lang = 'ja';
      b.textContent = c.text;
      if (c.len < kana.length) {
        const rest = document.createElement('span');
        rest.className = 'ime-rest';
        rest.textContent = kana.slice(c.len);
        b.append(rest);
      }
      b.title = i === 0 ? 'Space' : '';
      // Keep the cursor in the text box when a suggestion is clicked.
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => choose(c));
      bar.append(b);
    });
    bar.hidden = candidates.length === 0;
  }

  function hide() {
    candidates = [];
    bar.hidden = true;
    bar.replaceChildren();
  }

  function choose(c) {
    const comp = composition();
    if (comp && c.len === comp.text.length) learned.set(comp.text, c.text);
    const typed = comp ? comp.text.length : c.len; // all the kana typed so far
    const v = textarea.value;
    textarea.value = v.slice(0, compStart) + c.text + v.slice(compStart + c.len);
    committedUpTo = compStart + c.text.length;
    // When only the start was converted, the rest stays to be converted next.
    const caret = committedUpTo + Math.max(0, typed - c.len);
    textarea.setSelectionRange(caret, caret);
    textarea.focus();
    onChange();
    suggest();
  }

  function commit() {
    committedUpTo = textarea.selectionStart;
    hide();
  }

  /** Call on every input event, before the text is translated. */
  function handleInput(e) {
    if (!active() || e?.isComposing) { if (!active()) hide(); return; }
    const pos = textarea.selectionStart;
    const v = textarea.value;
    if (committedUpTo > v.length) committedUpTo = v.length;
    if (pos < committedUpTo) committedUpTo = pos;
    // Convert the romaji just before the cursor.
    const before = v.slice(0, pos);
    const m = before.match(/[a-zA-Z'\-.,!?]+$/);
    if (m) {
      const run = m[0];
      const kana = toKana(run, { IMEMode: true });
      if (kana !== run) {
        const start = pos - run.length;
        textarea.value = v.slice(0, start) + kana + v.slice(pos);
        const caret = start + kana.length;
        textarea.setSelectionRange(caret, caret);
      }
    }
    suggest();
  }

  function handleKeydown(e) {
    if (!active() || bar.hidden || e.isComposing) return;
    if ((e.key === ' ' || e.key === 'Enter') && candidates.length && !e.shiftKey) {
      e.preventDefault();
      choose(candidates[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    }
  }

  function handleMove() {
    // Clicking or moving the cursor keeps what's there and starts fresh.
    committedUpTo = textarea.selectionStart;
    hide();
  }

  textarea.addEventListener('keydown', handleKeydown);
  textarea.addEventListener('click', handleMove);
  textarea.addEventListener('keyup', (e) => { if (/^(Arrow|Home|End|Page)/.test(e.key)) handleMove(); });

  return {
    handleInput,
    /** Text was put in from elsewhere (drawing, history...): keep it as typed. */
    commitAll() { committedUpTo = textarea.selectionStart; hide(); },
    refresh() { committedUpTo = textarea.selectionStart; hide(); },
    preload() { dict(); },
  };
}
