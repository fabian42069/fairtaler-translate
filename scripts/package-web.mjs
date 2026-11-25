// Packs the built site (dist/) with the browser launchers (web-launcher/)
// into release/Fairtaler-Translate-<version>-web.zip.
// Run with:  npm run web   (builds first)
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const name = 'Fairtaler Translate';
const work = join(root, 'release', 'web');
const folder = join(work, name);
const zip = join(root, 'release', `Fairtaler-Translate-${version}-web.zip`);

rmSync(work, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(folder, { recursive: true });
cpSync(join(root, 'dist'), join(folder, 'app'), { recursive: true });

// Windows wants CRLF line endings in .cmd/.txt files; the shell script keeps LF.
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
for (const f of ['Start Fairtaler.cmd', 'serve.ps1', 'README.txt']) {
  writeFileSync(join(folder, f), crlf(readFileSync(join(root, 'web-launcher', f), 'utf8')));
}
writeFileSync(join(folder, 'start-fairtaler.sh'), readFileSync(join(root, 'web-launcher', 'start-fairtaler.sh'), 'utf8').replace(/\r\n/g, '\n'), { mode: 0o755 });
cpSync(join(root, 'LICENSE'), join(folder, 'LICENSE.txt'));

// bsdtar (Windows 10+, macOS) can write zip files; elsewhere use zip.
if (process.platform === 'linux') execFileSync('zip', ['-qr', zip, name], { cwd: work, stdio: 'inherit' });
else execFileSync('tar', ['-a', '-cf', zip, name], { cwd: work, stdio: 'inherit' });
rmSync(work, { recursive: true, force: true });

const mib = statSync(zip).size / 1024 / 1024;
console.log(`${zip} (${mib.toFixed(0)} MiB)`);
if (mib > 512) console.warn('Warning: larger than 512 MiB, too large for a Codeberg release.');
