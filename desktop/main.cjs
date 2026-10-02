const { app, BrowserWindow, Menu, dialog, shell, safeStorage } = require('electron');
const { fork, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

app.setName('PDFPal');
if (process.env.PDFPAL_DESKTOP_USER_DATA_DIR) app.setPath('userData', path.resolve(process.env.PDFPAL_DESKTOP_USER_DATA_DIR));
app.setAppUserModelId('local.pdfpal.desktop');
let window, service, log, origin, quitting = false;
const runtime = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'runtime');
const dataDir = path.join(app.getPath('userData'), 'data');
const logPath = path.join(app.getPath('userData'), 'desktop.log');

function detectCodex() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const base = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (!fs.existsSync(base)) return undefined;
  const candidates = fs.readdirSync(base).map(name => path.join(base, name, 'codex.exe')).filter(file => fs.existsSync(file));
  return candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
function startService() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dataDir, { recursive: true });
    // Rotate local logs; PDF files and notes live outside the installation directory.
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) fs.renameSync(logPath, logPath + '.old');
    log = fs.createWriteStream(logPath, { flags: 'a' });
    const codex = detectCodex();
    const env = { ...process.env, PDFPAL_DATA_DIR: dataDir };
    // The master key is protected by Windows DPAPI through Electron safeStorage.
    const protectedKeyPath = path.join(app.getPath('userData'), 'ai-secret-key.bin');
    if (safeStorage.isEncryptionAvailable()) {
      const legacyMasterKey = path.join(dataDir, '.ai-secret-key');
      if (!fs.existsSync(protectedKeyPath)) {
        const key = fs.existsSync(legacyMasterKey) ? fs.readFileSync(legacyMasterKey).toString('hex') : randomBytes(32).toString('hex');
        fs.writeFileSync(protectedKeyPath, safeStorage.encryptString(key));
        if (fs.existsSync(legacyMasterKey)) fs.unlinkSync(legacyMasterKey);
      }
      env.PDFPAL_AI_SECRET_KEY = safeStorage.decryptString(fs.readFileSync(protectedKeyPath));
    }
    if (codex) { env.CODEX_BIN = codex; env.PDFPAL_AGENT ||= 'codex'; }
    delete env.ELECTRON_RUN_AS_NODE;
    service = fork(path.join(runtime, 'backend', 'backend.mjs'), [], {
      execPath: path.join(runtime, 'node.exe'), cwd: path.join(runtime, 'backend'),
      env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    service.stdout.pipe(log, { end: false });
    service.stderr.pipe(log, { end: false });
    const timer = setTimeout(() => reject(new Error('本地文献服务启动超时。')), 45000);
    service.once('error', error => { clearTimeout(timer); reject(error); });
    service.on('message', message => {
      if (message?.type === 'ready' && Number.isInteger(message.port)) {
        clearTimeout(timer); origin = `http://127.0.0.1:${message.port}`; resolve(origin);
      }
    });
    service.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (!origin) reject(new Error(`本地文献服务未能启动 (${code ?? signal})。`));
      else if (!quitting) {
        dialog.showErrorBox('PDFPal', '本地服务意外停止。请重新打开 PDFPal。日志位置：\n' + logPath);
        app.quit();
      }
    });
  });
}
function external(url) {
  try { if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch {}
}
function setMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [
      { label: '打开数据文件夹', click: () => void shell.openPath(dataDir) },
      { type: 'separator' }, { label: '退出', role: 'quit' }
    ] },
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' },
      { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }
    ] },
    { label: '视图', submenu: [
      { label: '刷新页面', role: 'reload' }, { type: 'separator' },
      { label: '实际大小', role: 'resetZoom' }, { label: '放大', role: 'zoomIn' },
      { label: '缩小', role: 'zoomOut' }, { label: '全屏', role: 'togglefullscreen' }
    ] },
    { label: '帮助', submenu: [
      { label: '查看运行日志', click: () => void shell.openPath(logPath) },
      { label: '关于 PDFPal', click: () => void dialog.showMessageBox(window, {
        type: 'info', title: '关于 PDFPal', message: `PDFPal ${app.getVersion()} 中文桌面版`,
        detail: '本地文献库 · PDF 阅读 · 高亮与注释\n\nAI 问答支持本机命令行工具与自填 API。可在主页或阅读页的 AI 设置中配置。\n\n文献与笔记保存于：\n' + dataDir
      }) }
    ] }
  ]));
}
async function createWindow() {
  window = new BrowserWindow({
    title: 'PDFPal', width: 1440, height: 960, minWidth: 850, minHeight: 620,
    backgroundColor: '#13151a', icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.on('page-title-updated', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => {
    if (!origin || new URL(url).origin !== origin) { event.preventDefault(); external(url); }
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: '尚有未保存的注释', message: '离开页面会丢失尚未保存的修改。',
      buttons: ['继续编辑', '放弃修改并离开'], defaultId: 0, cancelId: 0
    });
    if (choice === 1) event.preventDefault();
  });
  await window.loadFile(path.join(__dirname, 'loading.html'));
  const url = await startService();
  await window.loadURL(url);
}
async function stopService() {
  if (!service || service.exitCode !== null || service.signalCode) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      const killer = spawn('taskkill.exe', ['/PID', String(service.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('exit', resolve); killer.once('error', () => { service.kill(); resolve(); });
    }, 4000);
    service.once('exit', () => { clearTimeout(timer); resolve(); });
    if (service.connected) service.send({ type: 'shutdown' }); else service.kill();
  });
  log?.end();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    setMenu();
    try { await createWindow(); }
    catch (error) { dialog.showErrorBox('PDFPal 启动失败', error.message + '\n\n可查看日志：' + logPath); app.quit(); }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true;
    void stopService().finally(() => app.quit());
  });
}
