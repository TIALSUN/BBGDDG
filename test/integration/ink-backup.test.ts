import test from 'node:test'
import assert from 'node:assert/strict'
import {zipSync,strToU8} from 'fflate'
import {createSource} from '../helpers/test-utils.js'
import {createInkBackup,restoreInkBackup} from '../../src/core/ink-backup.js'
import {createCanvas} from '@napi-rs/canvas'
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

test('recovery copies and image ink deduplicate by existing content across snapshots',async()=>{
 const config=testConfig(),db=testDb(config)
 try{
  const project=createProject(db),dest=createProject(db),missing=createProject(db),source=createSource(db,project),mapped=createSource(db,dest),ink=new InkService(db),time=new Date().toISOString()
  db.prepare('UPDATE sources SET content_hash=? WHERE id IN(?,?)').run('b'.repeat(64),source,mapped)
  const document={version:1 as const,revision:0,target:{kind:'pdf' as const,sourceId:source,page:1,contentHash:'b'.repeat(64)},blocks:[{id:'b',height:600,background:'blank' as const,strokes:[{id:'s',tool:'pen' as const,width:2,color:'#111827' as const,points:[{x:20,y:30}]}],images:[{id:'i',attachmentId:'img',x:0,y:0,width:20,height:10}]}]}
  db.prepare('INSERT INTO ink_attachments(id,project_id,metadata,bytes) VALUES(?,?,?,?)').run('img',project,'{}',createCanvas(20,10).toBuffer('image/png'))
  ink.save(project,document,0)
  const first=await createInkBackup(db,config,project);await restoreInkBackup(db,config,dest,first);await restoreInkBackup(db,config,missing,first)
  db.prepare('INSERT INTO notes(id,project_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('extra',project,'extra','',time,time)
  const next=await createInkBackup(db,config,project);await restoreInkBackup(db,config,dest,next);await restoreInkBackup(db,config,missing,next)
  assert.equal((db.prepare('SELECT count(*) n FROM ink_attachments WHERE project_id=?').get(dest) as {n:number}).n,1)
  assert.equal((db.prepare('SELECT count(*) n FROM ink_documents WHERE project_id=?').get(missing) as {n:number}).n,1,'missing PDF copies should not duplicate')
  const current=ink.get(dest,{...document.target,sourceId:mapped});current.blocks[0]!.strokes[0]!.points[0]!.x=99;ink.save(dest,current,current.revision)
  await restoreInkBackup(db,config,dest,next);await restoreInkBackup(db,config,dest,next)
  assert.equal((db.prepare('SELECT count(*) n FROM ink_documents WHERE project_id=?').get(dest) as {n:number}).n,2,'different existing PDF and a single recovery copy')
 }finally{cleanup(config,db)}
})

test('restore uses live items, rejects invalid annotation geometry and preflights stored sizes',async()=>{
 const config=testConfig(),db=testDb(config)
 try{
  const project=createProject(db),dest=createProject(db),source=createSource(db,project),mapped=createSource(db,dest),time=new Date().toISOString()
  db.prepare('UPDATE sources SET content_hash=? WHERE id IN(?,?)').run('a'.repeat(64),source,mapped)
  db.prepare('INSERT INTO notes(id,project_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('restore-me',project,'找回','正文',time,time)
  db.prepare('INSERT INTO annotations(id,project_id,source_id,page_number,x1,y1,x2,y2,text,color,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('ann',project,source,1,.1,.1,.3,.3,'text','yellow','',time)
  const first=await createInkBackup(db,config,project);await restoreInkBackup(db,config,dest,first)
  db.prepare("DELETE FROM notes WHERE project_id=? AND title='找回'").run(dest)
  await restoreInkBackup(db,config,dest,first)
  assert.equal((db.prepare("SELECT count(*) n FROM notes WHERE project_id=? AND title='找回'").get(dest) as {n:number}).n,1,'deleted note must be recoverable')
  db.prepare('INSERT INTO notes(id,project_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('new',project,'新增','',time,time)
  await restoreInkBackup(db,config,dest,await createInkBackup(db,config,project))
  assert.equal((db.prepare('SELECT count(*) n FROM annotations WHERE project_id=?').get(dest) as {n:number}).n,1,'unchanged annotations must not duplicate')
  for(const [page,x2] of [[999,.3],[1,.05]]){
   db.prepare('UPDATE annotations SET page_number=?,x2=? WHERE id=?').run(page,x2,'ann')
   await assert.rejects(()=>createInkBackup(db,config,project).then(bytes=>restoreInkBackup(db,config,dest,bytes)))
  }
  const malformed=Buffer.from(zipSync({'data.json':strToU8('x'.repeat(1024))},{level:0}));const central=malformed.readUInt32LE(malformed.length-6)
  malformed.writeUInt32LE(1,central+24)
  await assert.rejects(()=>restoreInkBackup(db,config,dest,malformed),/存储条目/,'reject before parsing manifest or allocating file data')
 }finally{cleanup(config,db)}
})
