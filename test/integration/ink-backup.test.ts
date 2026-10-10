import test from 'node:test'
import assert from 'node:assert/strict'
import {zipSync,strToU8} from 'fflate'
import {testConfig,testDb,createProject,cleanup} from '../helpers/test-utils.js'
import {InkService} from '../../src/core/ink.js'
test('editable backup restores note ink, deduplicates and rejects unsafe archives atomically',async()=>{
 const module=await import('../../src/core/ink-backup.js').catch(()=>null)
 assert.ok(module,'editable backup missing')
 const config=testConfig(),db=testDb(config)
 try{
  const project=createProject(db),targetProject=createProject(db),time=new Date().toISOString()
  db.prepare('INSERT INTO notes(id,project_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('note',project,'中文笔记','公式 $x^2$',time,time)
  new InkService(db).save(project,{version:1,revision:0,target:{kind:'note',noteId:'note'},blocks:[{id:'b',height:600,background:'grid',strokes:[{id:'s',tool:'pen',width:2,color:'#111827',points:[{x:20,y:30}]}]}]},0)
  const archive=await module.createInkBackup(db,config,project)
  const restored=await module.restoreInkBackup(db,config,targetProject,archive)
  assert.ok(restored.created>0)
  const ink=db.prepare('SELECT body FROM ink_documents WHERE project_id=?').get(targetProject) as {body:string}
  assert.equal(JSON.parse(ink.body).blocks[0].strokes[0].points[0].x,20)
  assert.ok((await module.restoreInkBackup(db,config,targetProject,archive)).duplicates>0)
  const count=(db.prepare('SELECT COUNT(*) n FROM notes WHERE project_id=?').get(targetProject) as {n:number}).n
  for(const unsafe of [zipSync({'../escape':strToU8('bad')},{level:0}),zipSync({'manifest.json':strToU8('{"version":999}')},{level:0})])await assert.rejects(()=>module.restoreInkBackup(db,config,targetProject,unsafe))
  assert.equal((db.prepare('SELECT COUNT(*) n FROM notes WHERE project_id=?').get(targetProject) as {n:number}).n,count)
 }finally{cleanup(config,db)}
})
