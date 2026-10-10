import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
test('note list is separate from editing and saved notes remain selectable',async({page})=>{
 const project=await createProjectViaApi(page,'笔记列表')
 const note=await(await page.request.post(`/api/projects/${project.id}/notes`,{data:{title:'第一篇',content:'原有内容'}})).json()
 await page.goto(`/projects/${project.id}/notes/${note.id}`)
 await expect(page.getByRole('navigation',{name:'笔记列表'})).toBeVisible()
 await page.getByRole('button',{name:'编辑正文',exact:true}).click()
 await page.getByLabel('笔记正文').fill('仍需手动保存')
 await expect(page.getByRole('status')).toContainText('草稿')
 await page.getByRole('button',{name:'保存笔记',exact:true}).click()
 await expect(page.getByRole('status')).toHaveText('已保存')
 await page.reload()
 await expect(page.locator('.prose.note-body')).toContainText('仍需手动保存')
})
test('settings groups separate reading, AI, data and application information',async({page})=>{
 await page.goto('/settings')
 for(const name of ['阅读与标注','AI','数据与备份','应用信息'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible()
})
