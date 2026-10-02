import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { ChatService } from '../../src/core/chat.js'
import { ChatMemoryStore } from '../../src/core/chat-memory.js'
import { openDatabase } from '../../src/core/database.js'
import { RetrievalService } from '../../src/core/retrieval.js'
import { buildServer } from '../../src/server/app.js'
import { cleanup, createProject, createSource, testConfig, testDb } from '../helpers/test-utils.js'

function fixture(failSummary=false){
 const config=testConfig(),db=testDb(config),project=createProject(db),source=createSource(db,project,'[Page 1]\nAlpha selection. Private unselected remainder.'),second=createSource(db,project,'[Page 1]\nBeta evidence from second paper.'),otherProject=createProject(db),other=createSource(db,otherProject,'[Page 1]\nOther project secret.')
 const retrieval=new RetrievalService(db)
 for(const [id,text] of [[source,'[Page 1]\nAlpha selection. Private unselected remainder.'],[second,'[Page 1]\nBeta evidence from second paper.'],[other,'[Page 1]\nOther project secret.']])retrieval.index(id!,text!)
 const log=path.join(config.dataDir,'prompts.jsonl');config.claudeBin=path.join(config.dataDir,'mock.mjs')
 fs.writeFileSync(config.claudeBin,`import fs from 'node:fs';let prompt='';for await(const chunk of process.stdin)prompt+=chunk;fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(prompt)+'\\n');const summary=prompt.startsWith('将以下对话');if(summary&&${failSummary})process.exit(1);console.log(JSON.stringify({result:summary?'用户关注 Alpha，并要求中文解释。':'合成回答 [1]。'}));`)
 return {config,db,project,source,second,otherProject,other,log,chat:new ChatService(db,config),memory:new ChatMemoryStore(db,config),prompts:()=>fs.readFileSync(log,'utf8').trim().split('\n').map(s=>JSON.parse(s) as string)}
}
test('older turns are summarized, carried into later answers and survive database reopen',async()=>{
 const f=fixture();let db=f.db
 try{
  for(let i=0;i<7;i++)await f.chat.ask(f.project,'Alpha question '+i,{sourceSelectors:[f.source]})
  const prompts=f.prompts(),summaries=prompts.filter(p=>p.startsWith('将以下对话'))
  assert.equal(summaries.length,1);assert.ok(summaries[0]!.includes('question 0'))
  assert.ok(prompts.at(-1)!.includes('用户关注 Alpha'));assert.ok(!prompts.at(-1)!.includes('question 0'))
  const memory=f.memory.get(f.project,f.source);assert.ok(memory.throughId>0);assert.equal(memory.revision,1)
  assert.equal(f.memory.get(f.project,f.second).summary,'');assert.equal(f.memory.get(f.project).summary,'')
  db.close();db=openDatabase(f.config)
  assert.equal(new ChatMemoryStore(db,f.config).get(f.project,f.source).summary,memory.summary)
  assert.equal(new ChatService(db,f.config).history(f.project,f.source).length,14)
 }finally{cleanup(f.config,db)}
})
test('manual correction, pause, clear cutoff and revision checks prevent overwrites',async()=>{
 const f=fixture()
 try{
  for(let i=0;i<6;i++)await f.chat.ask(f.project,'Alpha '+i,{sourceSelectors:[f.source]})
  let m=f.memory.save(f.project,f.source,{summary:'手动纠正：偏好中文',enabled:false,revision:0})
  assert.ok(m.throughId>0)
  await f.chat.ask(f.project,'Alpha next',{sourceSelectors:[f.source]})
  assert.ok(f.prompts().at(-1)!.includes('手动纠正'));assert.equal(f.prompts().filter(p=>p.startsWith('将以下对话')).length,0)
  assert.throws(()=>f.memory.save(f.project,f.source,{summary:'过期',enabled:true,revision:0}),/记忆已更新/)
  assert.equal(f.memory.autoSave(f.project,f.source,'过期自动摘要',100,0),false)
  m=f.memory.save(f.project,f.source,{summary:'',enabled:true,revision:m.revision})
  const calls=f.prompts().length
  await f.chat.ask(f.project,'Alpha after clear',{sourceSelectors:[f.source]})
  assert.equal(f.prompts().length,calls+1);assert.equal(f.memory.get(f.project,f.source).summary,'')
  assert.throws(()=>f.memory.get(f.otherProject,f.source))
 }finally{cleanup(f.config,f.db)}
})
test('summary failure is nonfatal and a failed answer does not advance memory',async()=>{
 const f=fixture(true)
 try{
  for(let i=0;i<6;i++)await f.chat.ask(f.project,'Alpha '+i,{sourceSelectors:[f.source]})
  const answer=await f.chat.ask(f.project,'Alpha next',{sourceSelectors:[f.source]})
  assert.match(answer.memoryWarning!,/未能整理/);assert.equal(f.memory.get(f.project,f.source).throughId,0)
  f.config.claudeBin='/missing';const failing=new ChatService(f.db,f.config)
  await assert.rejects(()=>failing.ask(f.project,'Alpha failed',{sourceSelectors:[f.source]}))
  assert.equal(f.memory.get(f.project,f.source).revision,0);assert.equal(f.chat.history(f.project,f.source).length,14)
 }finally{cleanup(f.config,f.db)}
})
test('scope excludes unselected text and other projects; project scope preserves reader conversation',async()=>{
 const f=fixture()
 try{
  fs.copyFileSync(new URL('../fixtures/sample.pdf',import.meta.url),path.join(f.config.filesDir,'fixture.pdf'))
  f.db.prepare('UPDATE sources SET local_path=? WHERE id=?').run('fixture.pdf',f.source)
  const selected=await f.chat.ask(f.project,'Explain',{sourceSelectors:[f.source],contextScope:'selection',selectedText:'Alpha selection.'})
  assert.ok(!f.prompts().at(-1)!.includes('Private unselected'));assert.ok(!f.prompts().at(-1)!.includes('Local documents available'))
  assert.equal(selected.references![0]!.page,1);assert.equal(selected.references![0]!.canJump,true)
  await assert.rejects(()=>f.chat.ask(f.project,'Explain',{sourceSelectors:[f.source],contextScope:'selection',selectedText:'forged text'}))
  const document=await f.chat.ask(f.project,'Beta',{sourceSelectors:[f.source],contextScope:'document'})
  assert.ok(!document.sources.some(s=>s.id===f.second));assert.ok(!f.prompts().at(-1)!.includes('Beta evidence'))
  const project=await f.chat.ask(f.project,'Beta',{sourceSelectors:[f.source],contextScope:'project',conversationSourceId:f.source})
  assert.ok(project.sources.some(s=>s.id===f.second));assert.ok(!f.prompts().at(-1)!.includes('Other project secret'))
  assert.equal(f.chat.history(f.project,f.source).length,6);assert.equal(f.chat.history(f.project).length,0)
  const saved=f.chat.history(f.project,f.source).at(-1)!;assert.equal(saved.context_scope,'project');assert.equal(JSON.parse(saved.references_json!)[0].sourceId,f.second)
  await f.chat.ask(f.project,'Alpha',{sourceSelectors:[f.source],conversationSourceId:null})
  assert.equal(f.chat.history(f.project).length,2)
 }finally{cleanup(f.config,f.db)}
})
test('same-conversation concurrent questions include the preceding completed turn',async()=>{
 const f=fixture()
 try{await Promise.all([f.chat.ask(f.project,'Alpha first',{sourceSelectors:[f.source]}),f.chat.ask(f.project,'Alpha second',{sourceSelectors:[f.source]})]);assert.ok(f.prompts().at(-1)!.includes('user: Alpha first'));assert.equal(f.chat.history(f.project,f.source).length,4)}finally{cleanup(f.config,f.db)}
})
test('memory endpoints require auth, validate revisions and persist alongside structured citations',async()=>{
 const f=fixture(),token='a'.repeat(64),headers={host:'localhost:80',origin:'http://localhost','x-bbgddg-token':token}
 f.db.close();let app=await buildServer(f.config,{accessToken:token})
 const url='/api/projects/'+f.project+'/sources/'+f.source+'/memory'
 try{
  assert.equal((await app.inject({method:'GET',url})).statusCode,401)
  assert.equal((await app.inject({method:'PUT',url,payload:{summary:'x',enabled:true,revision:0}})).statusCode,401)
  assert.equal((await app.inject({method:'GET',url,headers})).json().summary,'')
  const saved=await app.inject({method:'PUT',url,headers,payload:{summary:'手动记忆',enabled:false,revision:0}});assert.equal(saved.statusCode,200)
  for(const payload of [{summary:'x',enabled:true,revision:0},{summary:'x'.repeat(6001),enabled:true,revision:1},{summary:'x',enabled:true,revision:1,extra:1}])assert.equal((await app.inject({method:'PUT',url,headers,payload})).statusCode,400)
  const response=await app.inject({method:'POST',url:'/api/chat',headers,payload:{project_id:f.project,source_id:f.source,message:'Alpha',agent:'claude',context_scope:'document'}});assert.equal(response.statusCode,200);assert.match(response.body,/references/)
  const history=(await app.inject({method:'GET',url:url.replace('/memory','/chat'),headers})).json();assert.equal(history.messages[1].references[0].sourceId,f.source)
  await app.close();app=await buildServer(f.config,{accessToken:token});assert.equal((await app.inject({method:'GET',url,headers})).json().summary,'手动记忆')
  await app.inject({method:'DELETE',url:url.replace('/memory','/chat'),headers});assert.equal((await app.inject({method:'GET',url,headers})).json().summary,'')
 }finally{await app.close();cleanup(f.config,{close(){}} as never)}
})
