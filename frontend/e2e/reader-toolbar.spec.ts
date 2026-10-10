import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { createProjectViaApi } from './helpers';

test.describe('collapsible reader toolbar', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page }) => {
    expect((await page.request.put('/api/ui/preferences', { data: { readerTopCollapsed: false } })).ok()).toBeTruthy();
  });
  test.afterEach(async ({ page }) => {
    await page.request.put('/api/ui/preferences', { data: { readerTopCollapsed: false } });
  });

  async function upload(page: Page, projectId: string) {
    const response = await page.request.post(`/api/projects/${projectId}/sources/upload`, {
      multipart: { file: { name: '阅读工具栏测试.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(new URL('../../test/fixtures/sample.pdf', import.meta.url)) } },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async function reader(page: Page, projectId: string, sourceId: string) {
    await page.goto(`/projects/${projectId}/sources/${sourceId}`);
    await expect(page.locator('[data-pdf-page="1"]')).toHaveAttribute('data-pdf-ready', 'true');
    await expect(page.locator('.reader-top-toggle')).toBeEnabled();
    await expect(page.locator('.reader-topbar .ai-form-hint')).toBeHidden();
  }

  test('collapse gains reading space, preserves tools and persists for another PDF', async ({ page }) => {
    const project = await createProjectViaApi(page, 'Toolbar persistence');
    const source = await upload(page, project.id), second = await upload(page, project.id);
    await reader(page, project.id, source.id);
    const expanded = await page.getByTestId('pdf-scroll-area').boundingBox();
    const toggle = page.getByRole('button', { name: '收起顶部', exact: true });
    await toggle.focus();
    await toggle.press('Enter');
    const expand = page.getByRole('button', { name: '展开顶部', exact: true });
    await expect(expand).toBeEnabled();
    await expect(expand).toBeFocused();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: /返回项目/ })).toBeVisible();
    await expect(page.locator('.ai-entry>button')).toBeVisible();
    await expect(page.locator('.reading-panel')).toBeVisible();
    await expect(page.locator('.ai-current-usage')).toHaveCount(0);
    await expect(page.locator('.reading-notice')).toHaveCount(0);
    await expect.poll(async () => (await page.getByTestId('pdf-scroll-area').boundingBox())!.height - expanded!.height).toBeGreaterThan(20);
    expect((await (await page.request.get('/api/ui/preferences')).json()).readerTopCollapsed).toBe(true);
    await page.screenshot({ path: test.info().outputPath('reader-collapsed.png') });
    await page.reload();
    await expect(page.getByRole('button', { name: '展开顶部', exact: true })).toBeEnabled();
    await reader(page, project.id, second.id);
    await page.getByRole('button', { name: '展开顶部', exact: true }).click();
    await expect(page.getByRole('button', { name: '收起顶部', exact: true })).toBeEnabled();
    await expect(page.locator('.ai-entry>button')).toBeVisible();
    expect((await (await page.request.get('/api/ui/preferences')).json()).readerTopCollapsed).toBe(false);
  });

  test('collapsing preserves an unsaved annotation and keeps AI settings accessible', async ({ page }) => {
    const project = await createProjectViaApi(page, 'Toolbar annotations'), source = await upload(page, project.id);
    await page.request.post(`/api/projects/${project.id}/sources/${source.id}/annotations`, {
      data: { page_number: 1, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.15, text: '工具栏验证高亮', color: 'yellow' },
    });
    await reader(page, project.id, source.id);
    await page.getByText('更多',{exact:true}).click();
    await page.getByRole('button',{name:'标注管理',exact:true}).click();
    await page.locator('.annotation-card').click();
    await page.getByLabel('我的理解').fill('尚未保存的中文注释');
    await page.getByRole('button', { name: '收起顶部', exact: true }).click();
    await expect(page.getByLabel('我的理解')).toHaveValue('尚未保存的中文注释');
    await expect(page.locator('[data-annotation-id]')).toBeVisible();
    await page.locator('.ai-entry>button').click();
    await page.getByRole('button', { name: '配置 AI', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.ai-dialog-header .text-button').click();
    await expect(page.getByLabel('我的理解')).toHaveValue('尚未保存的中文注释');
  });

  test('failed preference saves remain visible in the collapsed reader', async ({ page }) => {
    const project = await createProjectViaApi(page, 'Toolbar save error'), source = await upload(page, project.id);
    await reader(page, project.id, source.id);
    await page.route('**/api/ui/preferences', route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'synthetic save failure' }) })
      : route.continue());
    await page.getByRole('button', { name: '收起顶部', exact: true }).click();
    await expect(page.locator('.reading-notice')).toContainText('顶部布局已切换，但未能保存');
    await expect(page.getByRole('button', { name: '展开顶部', exact: true })).toBeEnabled();
    await expect(page.getByTestId('pdf-scroll-area')).toBeVisible();
  });

  test('compact toolbar fits a narrow window without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const project = await createProjectViaApi(page, 'Narrow reader'), source = await upload(page, project.id);
    await reader(page, project.id, source.id);
    const expandedHeight = (await page.locator('.reader-topbar').boundingBox())!.height;
    await page.getByRole('button', { name: '收起顶部', exact: true }).click();
    await expect(page.getByRole('button', { name: '展开顶部', exact: true })).toBeEnabled();
    expect((await page.locator('.reader-topbar').boundingBox())!.height).toBeLessThan(expandedHeight - 30);
    await page.locator('.reader-topbar').getByRole('button',{name:/^AI：/}).click();
    await expect(page.locator('.reader-topbar').getByLabel('选择 AI 服务')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('reader-collapsed-narrow.png') });
  });
});
