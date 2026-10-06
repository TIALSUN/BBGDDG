const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
module.exports = async context => {
  for (const file of ['node.exe', 'backend/node_modules/zod/package.json', 'backend/node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node', 'backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'backend/frontend/dist/index.html']) {
    if (!fs.existsSync(path.join(context.appOutDir, 'resources', file))) throw new Error('Required bundled resource missing: ' + file);
  }
  execFileSync(path.join(__dirname, 'tools', 'rcedit-x64.exe'), [
    path.join(context.appOutDir, 'BBGDDG.exe'),
    '--set-icon', path.join(__dirname, 'assets', 'icon.ico'),
    '--set-version-string', 'ProductName', 'BBGDDG',
    '--set-version-string', 'FileDescription', 'BBGDDG 中文桌面版',
    '--set-file-version', context.packager.appInfo.version,
    '--set-product-version', context.packager.appInfo.version
  ], { windowsHide: true, stdio: 'inherit' });
};
