// Draw a kanji or kana with mouse, finger or pen; the closest matches are
// offered to put in the text. Uses KanjiCanvas (MIT) with stroke patterns from
// KanjiVG (CC BY-SA 3.0), served from this site and loaded on first use.
// Recognition works best with the usual stroke order and number of strokes.

const url = (p) => new URL(p, document.baseURI).href;
let loading;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(s);
  });
}
const load = () => (loading ??= loadScript(url('kanjicanvas/kanji-canvas.js')).then(() => loadScript(url('kanjicanvas/ref-patterns.js'))));

// Catppuccin Macchiato colours, one per stroke.
const STROKES = ['#c6a0f6', '#8aadf4', '#8bd5ca', '#a6da95', '#eed49f', '#f5a97f', '#ed8796', '#f5bde6', '#b7bdf8', '#7dc4e4'];

export function createDraw({ pop, canvas, candidates, status, onPick }) {
  let ready = false;
  const id = canvas.id;

  function recognize() {
    const KC = window.KanjiCanvas;
    if (!KC || !(KC['recordedPattern_' + id] || []).length) { render([]); return; }
    const out = String(KC.recognize(id) || '');
    render(out.trim().split(/\s+/).filter(Boolean));
  }

  function render(list) {
    candidates.replaceChildren(...list.map((ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'draw-cand';
      b.lang = 'ja';
      b.textContent = ch;
      b.setAttribute('aria-label', `Insert ${ch}`);
      b.addEventListener('click', () => { onPick(ch); clear(); });
      return b;
    }));
    status.hidden = list.length > 0;
  }

  function clear() {
    if (window.KanjiCanvas && ready) window.KanjiCanvas.erase(id);
    render([]);
  }

  function undo() {
    if (window.KanjiCanvas && ready) window.KanjiCanvas.deleteLast(id);
    recognize();
  }

  async function open() {
    pop.hidden = false;
    if (ready) return;
    status.textContent = 'Loading…';
    try {
      await load();
      const KC = window.KanjiCanvas;
      KC.strokeColors = Array.from({ length: 30 }, (_, i) => STROKES[i % STROKES.length]);
      canvas.dataset.strokeNumbers = 'false';
      KC.init(id);
      // Recognise after every stroke.
      for (const ev of ['mouseup', 'touchend']) canvas.addEventListener(ev, () => setTimeout(recognize, 0));
      ready = true;
      status.textContent = 'Draw a kanji or kana here. Matches appear after each stroke.';
    } catch {
      status.textContent = 'Drawing couldn’t load. Please try again.';
    }
  }

  function close() { pop.hidden = true; }

  return { open, close, clear, undo, isOpen: () => !pop.hidden };
}
