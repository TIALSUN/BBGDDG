const { execFileSync } = require('node:child_process');
const path = require('node:path');
module.exports = async context => {
  execFileSync(path.join(__dirname, 'tools', 'rcedit-x64.exe'), [
    path.join(context.appOutDir, 'PDFPal.exe'),
    '--set-icon', path.join(__dirname, 'assets', 'icon.ico'),
    '--set-version-string', 'ProductName', 'PDFPal',
    '--set-version-string', 'FileDescription', 'PDFPal 中文桌面版',
    '--set-file-version', context.packager.appInfo.version,
    '--set-product-version', context.packager.appInfo.version
  ], { windowsHide: true, stdio: 'inherit' });
};
