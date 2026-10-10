import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
test('failed upload keeps local draft across reload and retries',async({page})=>{
 const project=await createProjectViaApi(page,'手写恢复')
 const note=await(await page.request.post(`/api/projects/${project.id}/notes`,{data:{title:'恢复',content:'正文'}})).json()
 await page.route('**/ink',route=>route.request().method()==='PUT'?route.fulfill({status:503,body:'{}'}):route.continue())
 await page.goto(`/projects/${project.id}/notes/${note.id}`)
 await page.getByRole('button',{name:'添加手写块',exact:true}).click()
 await expect(page.getByText('手写保存失败，待重试',{exact:true})).toBeVisible()
 await page.reload()
 await expect(page.locator('[data-ink-canvas]')).toHaveCount(1)
 await page.unroute('**/ink')
 await page.getByRole('button',{name:'重试手写保存',exact:true}).click()
 await expect(page.getByText('手写已保存',{exact:true})).toBeVisible()
})
test('conflict keeps local and remote versions and explicit server adoption retains a copy',async({page})=>{
 const project=await createProjectViaApi(page,'手写冲突')
 const note=await(await page.request.post(`/api/projects/${project.id}/notes`,{data:{title:'冲突'}})).json(),url=`/api/projects/${project.id}/ink`
 await page.goto(`/projects/${project.id}/notes/${note.id}`)
 await page.getByRole('button',{name:'添加手写块',exact:true}).click()
 await expect(page.getByText('手写已保存',{exact:true})).toBeVisible()
 const remote=await(await page.request.get(`${url}?kind=note&noteId=${note.id}`)).json();remote.blocks[0].background='grid'
 await page.request.put(url,{data:{document:remote,expectedRevision:remote.revision}})
 await page.getByRole('button',{name:'添加手写块',exact:true}).click()
 await expect(page.getByRole('button',{name:'下载冲突副本',exact:true})).toBeVisible()
 await page.reload()
 await expect(page.locator('[data-ink-canvas]')).toHaveCount(2)
 page.once('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'采用服务器版本',exact:true}).click()
 await expect(page.locator('[data-ink-canvas]')).toHaveCount(1)
 await expect(page.getByLabel('手写纸张')).toHaveValue('grid')
})
