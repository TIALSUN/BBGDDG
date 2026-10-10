import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
test('clean local cache does not mask later server edits',async({page})=>{
 const project=await createProjectViaApi(page,'缓存一致性')
 const note=await(await page.request.post(`/api/projects/${project.id}/notes`,{data:{title:'缓存'}})).json()
 const url=`/api/projects/${project.id}/ink`
 await page.goto(`/projects/${project.id}/notes/${note.id}`)
 await page.getByRole('button',{name:'添加手写块',exact:true}).click()
 await expect(page.getByText('手写已保存',{exact:true})).toBeVisible()
 const document=await(await page.request.get(`${url}?kind=note&noteId=${note.id}`)).json()
 document.blocks[0].background='grid'
 expect((await page.request.put(url,{data:{document,expectedRevision:document.revision}})).ok()).toBe(true)
 await page.reload()
 await expect(page.getByLabel('手写纸张')).toHaveValue('grid')
})
