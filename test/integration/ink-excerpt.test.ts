import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvas} from '@napi-rs/canvas'
import {unzipSync} from 'fflate'
import {testConfig,testDb,createProject,createSource,cleanup} from '../helpers/test-utils.js'
import {createInkBackup} from '../../src/core/ink-backup.js'
test('excerpt creation rolls back image and note on failure and backups omit orphan images',async()=>{
 const module=await import('../../src/core/ink-excerpt.js').catch(()=>null);assert.ok(module,'transactional excerpt operation missing')
 const config=testConfig(),db=testDb(config)
 try{
  const project=createProject(db),source=createSource(db,project),bytes=createCanvas(20,10).toBuffer('image/png')
  db.prepare('UPDATE sources SET content_hash=? WHERE id=?').run('a'.repeat(64),source)
  db.exec("CREATE TRIGGER reject_ink BEFORE INSERT ON ink_documents BEGIN SELECT RAISE(ABORT,'failure'); END")
  assert.throws(()=>module.createInkExcerpt(db,project,{kind:'pdf',sourceId:source,page:1,contentHash:'a'.repeat(64)},[.1,.1,.3,.3],bytes))
  for(const table of ['notes','ink_attachments','ink_documents'])assert.equal((db.prepare(`SELECT count(*) n FROM ${table} WHERE project_id=?`).get(project) as {n:number}).n,0)
  db.exec('DROP TRIGGER reject_ink')
  const result=module.createInkExcerpt(db,project,{kind:'pdf',sourceId:source,page:1,contentHash:'a'.repeat(64)},[.1,.1,.3,.3],bytes)
  assert.ok(db.prepare('SELECT id FROM notes WHERE id=?').get(result.noteId))
  db.prepare('INSERT INTO ink_attachments(id,project_id,metadata,bytes) VALUES(?,?,?,?)').run('orphan',project,'{}',bytes)
  const files=unzipSync(await createInkBackup(db,config,project));assert.ok(!files['images/orphan.png']);assert.ok(files[`images/${result.id}.png`])
 }finally{cleanup(config,db)}
})
