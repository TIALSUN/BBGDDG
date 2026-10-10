import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
test('saved note supports editable handwriting without changing Markdown',async({page})=>{
 const project=await createProjectViaApi(page,'手写笔记')
 const note=await(await page.request.post(`/api/projects/${project.id}/notes`,{data:{title:'手写',content:'保留正文'}})).json()
 await page.goto(`/projects/${project.id}/notes/${note.id}`)
 await page.getByRole('button',{name:'添加手写块',exact:true}).click()
 await page.getByRole('button',{name:'钢笔',exact:true}).click()
 const canvas=page.locator('[data-ink-canvas]').first()
 await expect(canvas).toBeVisible()
 await canvas.evaluate(el=>{for(const [type,x,y] of [['pointerdown',30,40],['pointermove',70,90],['pointerup',90,120]] as const){const box=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:12,pointerType:'pen',clientX:box.left+x,clientY:box.top+y,pressure:.5}))}})
 await expect(canvas.locator('[data-ink-stroke]')).toHaveCount(1)
 await expect(page.getByText('手写已保存',{exact:true})).toBeVisible()
 await page.reload()
 await expect(page.locator('[data-ink-stroke]')).toHaveCount(1)
 await expect(page.locator('.prose.note-body')).toContainText('保留正文')
 await page.getByRole('button',{name:'撤销手写',exact:true}).click()
})
