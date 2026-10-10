import {test,expect} from '@playwright/test'

test('new project dialog traps focus, closes with Escape and returns focus',async({page})=>{
 await page.goto('/')
 const trigger=page.getByRole('button',{name:/新建项目/})
 await trigger.click()
 const dialog=page.getByRole('dialog',{name:'创建新项目'})
 await expect(dialog).toBeVisible()
 await expect(dialog.getByPlaceholder('例如：大语言模型缩放定律')).toBeFocused()
 await dialog.getByPlaceholder('例如：大语言模型缩放定律').fill('研究')
 for(let i=0;i<8;i++){
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true)
 }
 await page.keyboard.press('Escape')
 await expect(dialog).not.toBeVisible()
 await expect(trigger).toBeFocused()
})

test('project dialog fits touch viewport with reachable actions',async({page})=>{
 await page.setViewportSize({width:390,height:600})
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/')
 await page.getByRole('button',{name:/新建项目/}).click()
 const dialog=page.getByRole('dialog',{name:'创建新项目'})
 await expect(dialog).toBeVisible()
 for(const label of ['取消','创建项目']){
  const bounds=await dialog.getByRole('button',{name:label,exact:true}).boundingBox()
  expect(bounds?.width).toBeGreaterThanOrEqual(44)
  expect(bounds?.height).toBeGreaterThanOrEqual(44)
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
