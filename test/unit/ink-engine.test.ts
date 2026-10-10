import test from 'node:test'
import assert from 'node:assert/strict'
test('ink commands undo erase and keep independent snapshot history',async()=>{
 const module=await import('../../frontend/src/ink/history.js').catch(()=>null)
 assert.ok(module,'editable ink history must exist')
 const blocks=[{id:'b',height:600,background:'blank' as const,strokes:[]}]
 const history=new module.InkHistory(blocks)
 const stroke={id:'s',tool:'pen' as const,color:'#788bea',width:2,points:[{x:10,y:20},{x:30,y:40}]}
 assert.equal(history.apply({type:'addStroke',blockId:'b',stroke})[0].strokes.length,1)
 assert.equal(history.apply({type:'deleteStrokes',blockId:'b',ids:['s']})[0].strokes.length,0)
 assert.equal(history.undo()[0].strokes.length,1)
 assert.equal(history.undo()[0].strokes.length,0)
 assert.equal(history.redo()[0].strokes.length,1)
 assert.equal(blocks[0].strokes.length,0)
})
test('ink geometry converts inverse transforms without depending on page scale',async()=>{
 const module=await import('../../frontend/src/ink/geometry.js').catch(()=>null)
 assert.ok(module,'ink coordinate conversion must exist')
 assert.deepEqual(module.mapPoint({x:110,y:220},[.5,0,0,.5,-5,-10]),{x:50,y:100})
 assert.deepEqual(module.inverse([2,0,0,2,10,20]),[.5,0,0,.5,-5,-10])
 assert.throws(()=>module.inverse([0,0,0,0,0,0]))
})
test('eraser intersects sparse stroke segments between sampled points',async()=>{
 const module=await import('../../frontend/src/ink/geometry.js')
 assert.equal(typeof module.pathsIntersectWithin,'function')
 assert.equal(module.pathsIntersectWithin([{x:0,y:50},{x:100,y:50}],[{x:50,y:0},{x:50,y:100}],2),true)
 assert.equal(module.pathsIntersectWithin([{x:0,y:50},{x:100,y:50}],[{x:50,y:60}],2),false)
})
test('history isolates externally mutated input and returned snapshots',async()=>{
 const {InkHistory}=await import('../../frontend/src/ink/history.js')
 const history=new InkHistory([{id:'b',height:600,background:'blank',strokes:[]}])
 const stroke={id:'s',tool:'pen' as const,color:'#111827',width:2,points:[{x:10,y:20}]}
 const result=history.apply({type:'addStroke',blockId:'b',stroke})
 stroke.points[0].x=999;result[0].strokes[0].points[0].x=888
 assert.equal(history.blocks[0].strokes[0].points[0].x,10)
 history.undo();assert.equal(history.redo()[0].strokes[0].points[0].x,10)
})
test('stroke transform preserves pressure and undo restores native coordinates',async()=>{
 const {InkHistory}=await import('../../frontend/src/ink/history.js')
 const history=new InkHistory([{id:'b',height:600,background:'blank',strokes:[{id:'s',tool:'pen',color:'#111827',width:2,points:[{x:10,y:20,pressure:.7}]}]}])
 const result=history.apply({type:'transformStrokes',blockId:'b',ids:['s'],matrix:[2,0,0,2,5,-5]})
 assert.deepEqual(result[0].strokes[0].points[0],{x:25,y:35,pressure:.7})
 assert.deepEqual(history.undo()[0].strokes[0].points[0],{x:10,y:20,pressure:.7})
})
