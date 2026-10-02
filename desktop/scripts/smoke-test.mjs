import { localRequests } from './test-api.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = path.dirname(repo);
const require = createRequire(path.join(repo, 'package.json'));
const { _electron } = require('playwright');
const target = process.argv[2] || path.join(repo, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe');
const packaged = !!process.argv[2];
const userData = fs.mkdtempSync(path.join(work, 'desktop-test-'));
const electron = await _electron.launch({
  executablePath: target, args: packaged ? [] : [path.join(repo, 'desktop')],
  env: { ...process.env, BBGDDG_DESKTOP_USER_DATA_DIR: userData }, timeout: 60000
});
const errors = [];
let origin;
try {
  const page = await electron.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('heading', { name: '我的研究项目' }).waitFor({ timeout: 60000 });
  origin = new URL(page.url()).origin;
  const api=localRequests(page,origin);
  assert.equal((await fetch(origin+'/api/projects')).status,401);
  assert.ok(!(await page.evaluate(()=>document.cookie)).includes('bbgddg_session'));
  assert.equal((await api.get(origin + '/api/health')).status(), 200);
  const prefs = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.sandbox, true);
  const agents = await (await api.get(origin + '/api/agents')).json();
  if (process.env.BBGDDG_EXPECT_CODEX === '1') assert.ok(agents.agents.some(a => a.id === 'codex' && a.available));
  const project = await (await api.post(origin + '/api/projects', { data: { title: '桌面版验证', description: '本地 PDF 与注释持久化' } })).json();
  const response = await api.post(`${origin}/api/projects/${project.id}/sources/upload`, {
    multipart: { file: { name: '桌面测试.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(path.join(repo, 'test', 'fixtures', 'sample.pdf')) } }
  });
  assert.equal(response.status(), 200); const source = await response.json();
  const endpoint = `${origin}/api/projects/${project.id}/sources/${source.id}/annotations`;
  await page.goto(`${origin}/projects/${project.id}/sources/${source.id}`);
  await page.locator('[data-pdf-page="1"] .textLayer span').first().waitFor({ timeout: 30000 });
  const expected = await page.evaluate(() => {
    const span = [...document.querySelectorAll('[data-pdf-page="1"] .textLayer span')].find(el => el.textContent?.includes('Test page'));
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const box = range.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: box.left + 30, clientY: box.top + 10 }));
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  await page.locator('[data-ask-bubble]').waitFor();
  await page.getByRole('button', { name: '添加注释', exact: true }).click();
  await page.getByLabel('我的理解').fill('桌面软件的中文注释，关闭后保留。');
  await page.getByRole('button', { name: '保存注释', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.editor-actions')?.textContent.includes('已保存'));
  let annotations = await (await api.get(endpoint)).json();
  assert.equal(annotations.length, 1); assert.equal(annotations[0].note, '桌面软件的中文注释，关闭后保留。');
  const highlight = page.locator('[data-annotation-id]').first();
  const actual = await highlight.boundingBox();
  assert.ok(Math.abs(actual.x - expected.x) < 2 && Math.abs(actual.y - expected.y) < 2);
  assert.ok(Math.abs(actual.width - expected.width) < 2 && Math.abs(actual.height - expected.height) < 2);
  await page.reload();
  await page.locator('[data-annotation-id]').first().waitFor();
  await page.locator('.annotation-card').click();
  assert.equal(await page.getByLabel('我的理解').inputValue(), annotations[0].note);
  if (packaged) await page.screenshot({ path: path.join(userData, 'BBGDDG-桌面软件.png') });
  await page.locator('[data-annotation-id]').first().click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '取消高亮', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-annotation-id]'));
  assert.equal((await (await api.get(endpoint)).json()).length, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ executable: target, nativeSQLite: 'passed', bundledServer: 'passed', codexDetected: 'passed', pdfUpload: 'passed', highlightGeometry: 'passed', annotationPersistence: 'passed', cancelHighlight: 'passed', rendererIsolation: 'passed', pageErrors: errors }));
} finally {
  await electron.close();
  if (origin) {
    await new Promise(r => setTimeout(r, 1000));
    await assert.rejects(fetch(origin + '/api/health', { signal: AbortSignal.timeout(2000) }));
    console.log('Window close stopped bundled backend.');
  }
}
