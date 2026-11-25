// Removes the big offline files (translation models and voices) from the
// Android app after `cap sync`, so the APK stays small. The app downloads them
// from the web version the first time they're needed and keeps them on the
// phone (see public/sw.js). Keep this list in sync with HEAVY in public/sw.js.
import { rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'mobile', 'android', 'app', 'src', 'main', 'assets', 'public');
if (!existsSync(join(assets, 'index.html'))) throw new Error('Run "npx cap sync android" first');
for (const dir of ['bergamot/models', 'kokoro', 'piper', 'kuromoji/dict']) {
  rmSync(join(assets, dir), { recursive: true, force: true });
  console.log('left out of the APK (downloaded on first use):', dir);
}
