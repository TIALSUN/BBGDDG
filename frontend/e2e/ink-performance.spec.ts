import {test,expect} from '@playwright/test'
import {createProjectViaApi} from './helpers'
test('1000 strokes x 100 points input frame benchmark',async({page})=>{
 const project=await createProjectViaApi(page,'笔迹性能')
 const note=await(await page.request.post(`/api/projects/${project.id}/notes`,{data:{title:'性能画布'}})).json()
 const document={version:1,revision:0,target:{kind:'note',noteId:note.id},blocks:[{id:'benchmark',height:600,background:'blank',strokes:Array.from({length:1000},(_,s)=>({id:`s${s}`,tool:'pen',color:'#111827',width:1,points:Array.from({length:100},(_,p)=>({x:(s%50)*18+p/10,y:Math.floor(s/50)*25+p/10}))}))}]}
 expect((await page.request.put(`/api/projects/${project.id}/ink`,{data:{document,expectedRevision:0}})).ok()).toBe(true)
 await page.goto(`/projects/${project.id}/notes/${note.id}`)
 await page.getByRole('button',{name:'钢笔',exact:true}).click()
 const canvas=page.locator('[data-ink-canvas]')
 await expect(canvas.locator('[data-ink-stroke]')).toHaveCount(1000)
 const result=await canvas.evaluate(async el=>{const box=el.getBoundingClientRect(),times:number[]=[];const send=(type:string,n:number)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:24,pointerType:'pen',clientX:box.left+20+n,clientY:box.top+20+n,pressure:.5}));send('pointerdown',0);for(let n=1;n<=40;n++){const start=performance.now();send('pointermove',n);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));times.push(performance.now()-start)}send('pointercancel',41);return times.sort((a,b)=>a-b)[Math.floor(times.length*.95)]})
 console.log(`INK_BENCHMARK_P95_MS=${result.toFixed(2)}`)
 expect(result).toBeLessThan(50)
})
