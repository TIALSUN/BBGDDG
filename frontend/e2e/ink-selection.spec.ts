import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
import fs from 'node:fs'
test('Pencil region creates a cited image note and rejects foreign access',async({page})=>{
 const project=await createProjectViaApi(page,'区域摘录')
 const source=await(await page.request.post(`/api/projects/${project.id}/sources/upload`,{multipart:{file:{name:'教材.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(new URL('../../test/fixtures/sample.pdf',import.meta.url))}}})).json()
 await page.goto(`/projects/${project.id}/sources/${source.id}`)
 await page.getByRole('button',{name:'区域摘录',exact:true}).click()
 const canvas=page.locator('[data-pdf-page="1"] [data-ink-canvas]')
 await expect(canvas).toBeVisible()
 await canvas.evaluate(el=>{const box=el.getBoundingClientRect();for(const [type,x,y] of [['pointerdown',.1,.1],['pointerup',.4,.3]] as const)el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:14,pointerType:'pen',clientX:box.left+box.width*x,clientY:box.top+box.height*y}))})
 await page.getByRole('button',{name:'保存为摘录笔记',exact:true}).click()
 await page.getByRole('link',{name:'打开摘录笔记',exact:true}).click()
 await expect(page.locator('[data-ink-canvas] image')).toHaveCount(1)
 await expect(page.getByRole('button',{name:/回到原文/})).toBeVisible()
 const href=await page.locator('[data-ink-canvas] image').getAttribute('href')
 const other=await createProjectViaApi(page,'外部项目')
 const foreign=await page.request.get(href!.replace(project.id,other.id))
 expect(foreign.status()).toBe(404);const noteId=page.url().split('/').at(-1);await page.request.delete(`/api/projects/${project.id}/notes/${noteId}`);expect((await page.request.get(href!)).status()).toBe(404)
})
