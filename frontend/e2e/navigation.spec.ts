import { test, expect } from '@playwright/test';
import { createProjectViaApi } from './helpers';

test('page loads and shows BBGDDG branding', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.brand')).toContainText('BBGDDG');
});
test('home page shows the Chinese project heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的研究项目', exact: true })).toBeVisible();
});
test('local workspace status is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('本地工作区')).toBeVisible();
});
test('unknown route redirects to the library', async ({ page }) => {
  await page.goto('/nonexistent-page');
  await expect(page.getByRole('heading', { name: '我的研究项目', exact: true })).toBeVisible();
});
test('direct project URL opens its source workspace', async ({ page }) => {
  const project = await createProjectViaApi(page, 'Nav Test Project');
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '文献', exact: true })).toBeVisible();
});
test('project link returns to the library', async ({ page }) => {
  const project = await createProjectViaApi(page, 'Back Nav Project');
  await page.goto(`/projects/${project.id}`);
  await page.getByRole('link', { name: /所有项目/ }).click();
  await expect(page.getByRole('heading', { name: '我的研究项目', exact: true })).toBeVisible();
});
