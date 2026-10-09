import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { mockAuth, createProjectViaApi, mockExtract } from './helpers';

test.describe('Sources management', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('sources tab shows empty state', async ({ page }) => {
    const project = await createProjectViaApi(page, 'Sources Empty Project');

    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole('button', { name: '文献', exact: true })).toBeVisible();
    await expect(page.locator('text=暂无文献。拖入文件，或点击添加文献。')).toBeVisible();
  });

  test('add source via URL with mocked extract', async ({ page }) => {
    const project = await createProjectViaApi(page, 'Sources Add Project');

    // Mock the extract endpoint
    await mockExtract(page, { title: 'Test Paper: A Study', sourceId: 'src-123' });

    await page.goto(`/projects/${project.id}`);
    await expect(page.locator('text=暂无文献。拖入文件，或点击添加文献。')).toBeVisible();

    // Click "Add Source" button (the one in the header, not modal)
    await page.getByRole('button', { name: /添加文献/ }).first().click();

    // Modal should appear with "Add a source" heading
    await expect(page.getByRole('heading', { name: '添加文献' })).toBeVisible();

    // Switch to URL tab
    await page.getByRole('button', { name: /粘贴链接/ }).click();

    // Enter a URL
    await page.getByPlaceholder('https://arxiv.org/abs/1234.56789').fill('https://arxiv.org/abs/2301.00001');

    // Click Add Source button (the one inside the URL tab modal, exact match)
    await page.getByRole('button', { name: '添加文献', exact: true }).click();

    // Modal should close and source should appear
    await expect(page.getByRole('heading', { name: '添加文献' })).not.toBeVisible();
    await expect(page.locator('text=Test Paper: A Study')).toBeVisible();
  });

  test('click source navigates to reader view', async ({ page }) => {
    const project = await createProjectViaApi(page, 'Source Click Project');

    // Create a source via API by mocking extract
    const sourceId = 'src-click-test';
    await mockExtract(page, { title: 'Clickable Paper', sourceId });

    await page.goto(`/projects/${project.id}`);

    // Add the source via URL tab
    await page.getByRole('button', { name: /添加文献/ }).first().click();
    await page.getByRole('button', { name: /粘贴链接/ }).click();
    await page.getByPlaceholder('https://arxiv.org/abs/1234.56789').fill('https://example.com/paper.pdf');
    await page.getByRole('button', { name: '添加文献', exact: true }).click();

    // Wait for modal to close
    await expect(page.getByRole('heading', { name: '添加文献' })).not.toBeVisible();
    await expect(page.locator('text=Clickable Paper')).toBeVisible();

    // Mock the source GET endpoint for the reader view
    await page.route(`**/api/projects/${project.id}/sources/${sourceId}`, route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: sourceId,
            project_id: project.id,
            type: 'pdf',
            url: 'https://example.com/paper.pdf',
            title: 'Clickable Paper',
            pages: 5,
            pdf_text: 'Mock paper content.',
            created_at: new Date().toISOString(),
            accessed_at: new Date().toISOString(),
          }),
        });
      }
      return route.continue();
    });

    // Click the source
    await page.locator('text=Clickable Paper').click();

    // Should navigate to the reader route using the real source id — not
    // "undefined", which is what a mismatched field name in the optimistic
    // insert (SearchPaperModal's onAdded) used to produce.
    await page.waitForURL(`**/projects/${project.id}/sources/${sourceId}`);
    expect(page.url()).not.toContain('/sources/undefined');
  });

  test('reader restores the last page read after reload', async ({ page }) => {
    const project = await createProjectViaApi(page, 'Reading Progress Project');
    const created = await page.request.post(`/api/projects/${project.id}/sources/upload`, {
      multipart: { file: { name: 'Progress Book.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(new URL('../../test/fixtures/sample.pdf', import.meta.url)) } },
    });
    expect(created.ok()).toBeTruthy();
    const source = await created.json();

    await page.goto(`/projects/${project.id}/sources/${source.id}`);
    await expect(page.getByTestId('page-progress')).toHaveText('第 1 页 / 共 2 页');

    const saved = page.waitForResponse(response => {
      if (response.request().method() !== 'PATCH') return false;
      if (!response.url().endsWith(`/api/projects/${project.id}/sources/${source.id}`)) return false;
      return response.request().postDataJSON()?.last_page_read === 2;
    });
    await page.locator('[data-pdf-page="2"]').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await expect(page.getByTestId('page-progress')).toHaveText('第 2 页 / 共 2 页');
    await saved;

    await page.reload();
    await expect(page.getByTestId('page-progress')).toHaveText('第 2 页 / 共 2 页');
    await expect.poll(async () => page.locator('[data-pdf-page="2"]').evaluate(element => {
      const scroll = element.closest('[data-testid="pdf-scroll-area"]');
      if (!scroll) return false;
      const pageRect = element.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      // A short final page can hit the bottom scroll limit before top alignment.
      const target = Math.min(scroll.scrollHeight - scroll.clientHeight,
        Math.max(0, scroll.scrollTop + pageRect.top - scrollRect.top - 16));
      return Math.abs(scroll.scrollTop - target) < 8;
    })).toBe(true);
  });
});
