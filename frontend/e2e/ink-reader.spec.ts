import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
import fs from 'node:fs'
test('PDF strokes retain native coordinates across zoom and reload',async({page})=>{
 const project=await createProjectViaApi(page,'PDF手写')
 const source=await(await page.request.post(`/api/projects/${project.id}/sources/upload`,{multipart:{file:{name:'教材.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(new URL('../../test/fixtures/sample.pdf',import.meta.url))}}})).json()
 await page.goto(`/projects/${project.id}/sources/${source.id}`)
 await page.getByRole('button',{name:'钢笔',exact:true}).click()
 const canvas=page.locator('[data-pdf-page="1"] [data-ink-canvas]')
 await expect(canvas).toBeVisible()
 await canvas.evaluate(el=>{const box=el.getBoundingClientRect();for(const [type,x,y] of [['pointerdown',.1,.1],['pointermove',.2,.2],['pointerup',.3,.3]] as const)el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:14,pointerType:'pen',clientX:box.left+box.width*x,clientY:box.top+box.height*y}))})
 const stroke=canvas.locator('[data-ink-stroke]')
 await expect(stroke).toHaveCount(1)
 const points=await stroke.getAttribute('points')
 await expect(page.locator('[data-pdf-page="1"] .pdf-ink-status')).toContainText('手写已保存')
 await page.getByTitle('放大',{exact:true}).click()
 await expect(canvas.locator('[data-ink-stroke]')).toHaveAttribute('points',points!)
 await page.getByRole('button',{name:'撤销本页手写',exact:true}).first().click();await expect(canvas.locator('[data-ink-stroke]')).toHaveCount(0);await page.getByRole('button',{name:'重做本页手写',exact:true}).first().click();await expect(canvas.locator('[data-ink-stroke]')).toHaveAttribute('points',points!);await expect(page.locator('[data-pdf-page="1"] .pdf-ink-status')).toContainText('手写已保存')
 await page.reload()
 await expect(page.locator('[data-pdf-page="1"] [data-ink-stroke]')).toHaveAttribute('points',points!)
 await page.getByRole('button',{name:'整笔橡皮',exact:true}).click()
})
