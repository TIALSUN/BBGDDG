import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(path.dirname(desktop), 'release');
const unpacked = path.join(release, 'win-unpacked');
const { version } = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const output = path.join(release, `BBGDDG-${version}-Portable.zip`);
for (const file of ['BBGDDG.exe', 'resources/backend/node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node']) {
  if (!fs.existsSync(path.join(unpacked, file))) throw new Error(`Required portable resource missing: ${file}`);
}
const require = createRequire(path.join(desktop, 'package.json'));
const { path7za } = require('7zip-bin');
fs.rmSync(output, { force: true });
const result = spawnSync(path7za, ['a', '-tzip', '-mx=3', '-mmt=2', output, '.'], {
  cwd: unpacked, stdio: 'inherit', windowsHide: true
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Portable ZIP ready: ${output}`);
