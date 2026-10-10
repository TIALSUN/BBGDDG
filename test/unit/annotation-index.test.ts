import test from 'node:test'
import assert from 'node:assert/strict'
test('annotation index preserves page, kind and ink target identity',async()=>{
 const module=await import('../../frontend/src/ink/annotation-index.js').catch(()=>null)
 assert.ok(module,'annotation index missing')
 const ink={version:1 as const,revision:1,target:{kind:'pdf' as const,sourceId:'source',page:2,contentHash:'a'.repeat(64)},blocks:[{id:'b',height:600,background:'blank' as const,strokes:[{id:'s',tool:'line' as const,color:'#111827',width:2,points:[{x:10,y:20},{x:30,y:20}]}]}]}
 const result=module.buildAnnotationIndex([], [ink])
 assert.equal(result[0].kind,'underline');assert.equal(result[0].page,2);assert.equal(result[0].targetId,'s')
})
