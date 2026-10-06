import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(desktop);
const runtime = path.join(desktop, 'runtime');
const backend = path.join(runtime, 'backend');
const npm = process.env.BBGDDG_NPM_CLI || process.env.npm_execpath;
if (!npm) throw new Error('Run this script through npm run prepare:runtime, or set BBGDDG_NPM_CLI to npm-cli.js.');
if (!fs.existsSync(path.join(repo, 'frontend', 'dist', 'index.html'))) throw new Error('Build the parent BBGDDG project first.');
if (!fs.existsSync(path.join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe'))) {
  const install = spawnSync(process.execPath, [path.join(desktop, 'node_modules', 'electron', 'install.js')], { windowsHide: true, stdio: 'inherit' });
  if (install.status !== 0) throw new Error('Unable to install desktop Electron runtime');
}
fs.mkdirSync(path.join(backend, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(desktop, 'assets'), { recursive: true });
for (const name of ['package.json', 'package-lock.json', 'LICENSE', 'NOTICE.md']) fs.copyFileSync(path.join(repo, name), path.join(backend, name));
fs.copyFileSync(path.join(repo, 'frontend', 'package.json'), path.join(backend, 'frontend', 'package.json'));
fs.cpSync(path.join(repo, 'dist'), path.join(backend, 'dist'), { recursive: true });
fs.cpSync(path.join(repo, 'frontend', 'dist'), path.join(backend, 'frontend', 'dist'), { recursive: true });
fs.copyFileSync(path.join(desktop, 'backend.mjs'), path.join(backend, 'backend.mjs'));
fs.copyFileSync(process.execPath, path.join(runtime, 'node.exe'));
fs.copyFileSync(path.join(repo, 'frontend', 'public', 'icon-512.png'), path.join(desktop, 'assets', 'icon.png'));
const result = spawnSync(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--workspaces=false', '--no-audit', '--no-fund'], { cwd: backend, stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
// Root dependencies must be installed with the same Node used for packaging.
fs.cpSync(path.join(repo, 'node_modules', 'better-sqlite3', 'build'), path.join(backend, 'node_modules', 'better-sqlite3', 'build'), { recursive: true });
if (process.platform === 'win32' && process.arch === 'x64') {
  fs.cpSync(path.join(repo, 'node_modules', '@napi-rs', 'canvas-win32-x64-msvc'), path.join(backend, 'node_modules', '@napi-rs', 'canvas-win32-x64-msvc'), { recursive: true });
}
const nodeVersion = process.versions.node;
const license = await fetch(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`);
if (!license.ok) throw new Error('Unable to retrieve bundled Node license');
fs.writeFileSync(path.join(backend, 'NODE-LICENSE.txt'), await license.text());
const require = createRequire(path.join(repo, 'package.json'));
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const canvas = createCanvas(256, 256);
canvas.getContext('2d').drawImage(await loadImage(path.join(desktop, 'assets', 'icon.png')), 0, 0, 256, 256);
const png = canvas.toBuffer('image/png');
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(desktop, 'assets', 'icon.ico'), Buffer.concat([header, png]));
fs.mkdirSync(path.join(desktop, 'tools'), { recursive: true });
const editor = path.join(desktop, 'tools', 'rcedit-x64.exe');
if (!fs.existsSync(editor)) {
  const response = await fetch('https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z');
  if (!response.ok) throw new Error('Unable to retrieve Windows resource editor');
  const archive = path.join(desktop, 'tools', 'winCodeSign.7z');
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const unzip = path.join(desktop, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  const extraction = spawnSync(unzip, ['x', '-y', archive, 'rcedit-x64.exe', '-o' + path.dirname(editor)], { windowsHide: true, stdio: 'inherit' });
  if (extraction.status !== 0) throw new Error('Unable to extract Windows resource editor');
}
console.log('Desktop runtime, native SQLite and Windows icon ready.');
