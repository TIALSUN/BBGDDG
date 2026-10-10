import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
import fs from 'node:fs'
test('reader adapts narrow split windows without losing a note draft',async({page})=>{
 const project=await createProjectViaApi(page,'平板阅读')
 const response=await page.request.post(`/api/projects/${project.id}/sources/upload`,{multipart:{file:{name:'教材.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(new URL('../../test/fixtures/sample.pdf',import.meta.url))}}})
 const source=await response.json()
 await page.setViewportSize({width:1024,height:768})
 await page.goto(`/projects/${project.id}/sources/${source.id}`)
 await page.getByRole('button',{name:'笔记',exact:true}).click()
 await page.getByRole('button',{name:'新建笔记',exact:true}).click()
 await page.getByLabel('笔记正文').fill('旋转后继续写作')
 await expect(page.getByRole('separator',{name:'调整阅读面板宽度'})).toBeVisible()
 await page.setViewportSize({width:820,height:1024})
 const tools=page.getByRole('navigation',{name:'平板阅读工具'})
 await expect(tools).toBeVisible()
 await tools.getByRole('button',{name:'打开标注',exact:true}).click()
 await tools.getByRole('button',{name:'打开笔记',exact:true}).click()
 await expect(page.getByLabel('笔记正文')).toHaveValue('旋转后继续写作')
 await page.setViewportSize({width:390,height:650})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.setViewportSize({width:1024,height:768})
 await expect(page.getByLabel('笔记正文')).toHaveValue('旋转后继续写作')
})
