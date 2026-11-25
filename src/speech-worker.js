// Background worker that makes speech, so the page stays responsive.
import { synthesizeWith } from './speech-engines.js';

self.onmessage = async (e) => {
  const { id, base, engine, text, code } = e.data;
  globalThis.__ttsBase = base;
  try {
    const blob = await synthesizeWith(engine, text, code);
    const buffer = await blob.arrayBuffer();
    self.postMessage({ id, ok: true, buffer, type: blob.type }, [buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
