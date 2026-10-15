import fs from 'node:fs'
import {test,expect,type Page} from '@playwright/test'
import {createProjectViaApi} from './helpers'

// Derivations the models emit are wider than the reading panel's chat message,
// and KaTeX keeps display math on a single nowrap line.
const LONG_FORMULA='h_t = g(W_H h_{t-1} + W_I x_t) = g\\left(W_H g(W_H h_{t-2} + W_I x_{t-1}) + W_I x_t\\right) + \\cdots'

async function askWithAnswer(page:Page,text:string){
 const project=await createProjectViaApi(page,'长公式')
 const source=await(await page.request.post(`/api/projects/${project.id}/sources/upload`,{multipart:{file:{name:'教材.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(new URL('../../test/fixtures/sample.pdf',import.meta.url))}}})).json()
 await page.route('**/api/chat',route=>route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({text,contextScope:'document'})+'\n\ndata: [DONE]\n\n'}))
 await page.goto(`/projects/${project.id}/sources/${source.id}`)
 await page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）').fill('解释递归展开')
 await page.getByRole('button',{name:'发送问题'}).click()
}

test('a long formula stays inside the answer message and can be scrolled to its end',async({page})=>{
 await askWithAnswer(page,`文中还把 $h_t$ 递归展开：\n\n$$${LONG_FORMULA}$$\n\n这说明 $h_t$ 层层嵌套。`)
 const display=page.locator('.chat-answer .katex-display')
 await expect(display).toHaveCount(1)
 const metrics=await display.evaluate(el=>{
  const message=(el.closest('.chat-answer') as HTMLElement).getBoundingClientRect(),box=el.getBoundingClientRect()
  return {scroll:el.scrollWidth,client:el.clientWidth,left:box.left,right:box.right,messageLeft:message.left,messageRight:message.right}
 })
 // The formula really is wider than the message, so it has to scroll.
 expect(metrics.scroll).toBeGreaterThan(metrics.client+20)
 expect(metrics.left).toBeGreaterThanOrEqual(metrics.messageLeft-1)
 expect(metrics.right).toBeLessThanOrEqual(metrics.messageRight+1)
 // Both ends are reachable: scrolling right shows the tail, scrolling back the head.
 const end=await display.evaluate(el=>{el.scrollLeft=el.scrollWidth;const math=(el.querySelector('.katex') as HTMLElement).getBoundingClientRect();return {mathRight:math.right,boxRight:el.getBoundingClientRect().right}})
 expect(end.mathRight).toBeLessThanOrEqual(end.boxRight+1)
 const start=await display.evaluate(el=>{el.scrollLeft=0;const math=(el.querySelector('.katex') as HTMLElement).getBoundingClientRect();return {mathLeft:math.left,boxLeft:el.getBoundingClientRect().left}})
 expect(start.mathLeft).toBeGreaterThanOrEqual(start.boxLeft-1)
})

test('a formula fenced on one line renders as math instead of a KaTeX error',async({page})=>{
 await askWithAnswer(page,`递归展开为：\n\n$$${LONG_FORMULA}\n+ \\cdots$$\n\n这就是展开结果。`)
 await expect(page.locator('.chat-answer')).toContainText('展开结果')
 await expect(page.locator('.chat-answer .katex-error')).toHaveCount(0)
 await expect(page.locator('.chat-answer .katex-display')).toHaveCount(1)
})
