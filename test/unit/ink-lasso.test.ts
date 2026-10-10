import test from 'node:test'
import assert from 'node:assert/strict'
test('lasso selects enclosed strokes without selecting outside ink',async()=>{
 const module=await import('../../frontend/src/ink/lasso.js').catch(()=>null)
 assert.ok(module,'lasso selector must exist')
 const stroke=(id:string,x:number)=>({id,tool:'pen' as const,color:'#111827',width:2,points:[{x,y:10},{x:x+1,y:20}]})
 assert.deepEqual(module.selectStrokes([stroke('in',10),stroke('out',100)],[{x:0,y:0},{x:40,y:0},{x:40,y:40},{x:0,y:40}]),['in'])
 assert.deepEqual(module.selectStrokes([stroke('in',10)],[]),[])
})
