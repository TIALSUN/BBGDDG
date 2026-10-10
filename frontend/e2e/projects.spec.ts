import { test, expect } from '@playwright/test';
import { createProjectViaApi } from './helpers';

test('project library exposes its search and creation controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的项目', exact: true })).toBeVisible();
  await expect(page.getByLabel('搜索项目')).toBeVisible();
});
test('a project can be created through the Chinese modal and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /新建项目/ }).click();
  await expect(page.getByRole('heading', { name: '创建新项目', exact: true })).toBeVisible();
  await page.getByPlaceholder('例如：大语言模型缩放定律').fill('My E2E Test Project');
  await page.getByPlaceholder('你正在研究什么？').fill('Testing BBGDDG');
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
  await page.getByRole('button', { name: '项目设置：修改名称', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Renamed Project', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Renamed Project', exact: true })).toBeVisible();
});
test('deleting from the library removes the project and stays removed', async ({ page }) => {
  const project = await createProjectViaApi(page, 'Delete Me Project');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel(`项目${project.title}的更多操作`).click();
  await page.getByRole('button', { name: '删除项目' + project.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: project.title, exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: project.title, exact: true })).not.toBeVisible();
});

test('library search can be cleared and fits a narrow viewport', async ({ page }) => {
  const project = await createProjectViaApi(page, '移动端研究项目');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('搜索项目').fill('没有这个项目的关键词');
  await expect(page.getByRole('heading', { name: '没有匹配的项目' })).toBeVisible();
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('切换首页侧栏').click();
  await expect(page.getByRole('navigation', { name: '文献库导航' })).not.toBeVisible();
  await page.getByLabel('切换首页侧栏').click();
  await expect(page.getByRole('navigation', { name: '文献库导航' })).toBeVisible();
});
