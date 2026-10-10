import test from 'node:test'
import assert from 'node:assert/strict'
import {buildTestServer} from '../helpers/server-utils.js'
import {testConfig,cleanup} from '../helpers/test-utils.js'
test('ink API persists revisions and rejects stale, invalid and foreign targets',async()=>{
 const config=testConfig(),app=await buildTestServer(config)
 try{
  const project=(await app.inject({method:'POST',url:'/api/projects',payload:{title:'手写'}})).json()
  const note=(await app.inject({method:'POST',url:`/api/projects/${project.id}/notes`,payload:{title:'笔记'}})).json()
  const target={kind:'note',noteId:note.id}
  const url=`/api/projects/${project.id}/ink`
  const initial=await app.inject({url:url+`?kind=note&noteId=${note.id}`})
  assert.equal(initial.statusCode,200);assert.equal(initial.json().revision,0)
  const document={version:1,revision:0,target,blocks:[{id:'block',height:600,background:'blank',strokes:[{id:'stroke',tool:'pen',color:'#788bea',width:2,points:[{x:10,y:20},{x:30,y:40,pressure:.5}]}]}]}
  const saved=await app.inject({method:'PUT',url,payload:{document,expectedRevision:0}})
  assert.equal(saved.statusCode,200);assert.equal(saved.json().revision,1)
  assert.equal((await app.inject({method:'PUT',url,payload:{document,expectedRevision:0}})).statusCode,409)
  assert.equal((await app.inject({url:url+`?kind=note&noteId=${note.id}`})).json().blocks[0].strokes[0].points[1].x,30)
  const invalid=structuredClone(document);invalid.blocks[0].strokes[0].points[1].pressure=2
  assert.equal((await app.inject({method:'PUT',url,payload:{document:invalid,expectedRevision:1}})).statusCode,400)
  const other=(await app.inject({method:'POST',url:'/api/projects',payload:{title:'另一个'}})).json()
  assert.equal((await app.inject({url:`/api/projects/${other.id}/ink?kind=note&noteId=${note.id}`})).statusCode,404)
  await app.inject({method:'DELETE',url:`/api/projects/${project.id}/notes/${note.id}`})
  assert.equal((await app.inject({url:url+`?kind=note&noteId=${note.id}`})).statusCode,404)
 }finally{await app.close();cleanup(config,{close(){}} as never)}
})
