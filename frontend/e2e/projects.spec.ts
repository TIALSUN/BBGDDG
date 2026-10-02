import { test, expect } from '@playwright/test';
import { createProjectViaApi } from './helpers';

test('project library exposes its search and creation controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的研究项目', exact: true })).toBeVisible();
  await expect(page.getByLabel('搜索项目')).toBeVisible();
});
test('a project can be created through the Chinese modal and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /新建项目/ }).click();
  await expect(page.getByRole('heading', { name: '创建新项目', exact: true })).toBeVisible();
  await page.getByPlaceholder('例如：大语言模型缩放定律').fill('My E2E Test Project');
  await page.getByPlaceholder('你正在研究什么？').fill('Testing PDFPal');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: '创建新项目', exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My E2E Test Project', exact: true })).toBeVisible();
});
test('project card opens source and note navigation', async ({ page }) => {
  const project = await createProjectViaApi(page, 'Click Test Project');
  await page.goto('/');
  await page.getByRole('heading', { name: project.title, exact: true }).click();
  await expect(page.getByRole('button', { name: '文献', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '笔记', exact: true })).toBeVisible();
});
test('renaming from the workspace persists after reload', async ({ page }) => {
  const project = await createProjectViaApi(page, 'Old Project Name');
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept('Renamed Project'));
  await page.getByRole('button', { name: '编辑项目名称', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Renamed Project', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Renamed Project', exact: true })).toBeVisible();
});
test('deleting from the library removes the project and stays removed', async ({ page }) => {
  const project = await createProjectViaApi(page, 'Delete Me Project');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除项目' + project.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: project.title, exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: project.title, exact: true })).not.toBeVisible();
});
