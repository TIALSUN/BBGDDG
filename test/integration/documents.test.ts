import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { extractDocument } from '../../src/core/documents.js'
import { SourceService } from '../../src/core/sources.js'
import { ProjectService } from '../../src/core/projects.js'
import { RetrievalService } from '../../src/core/retrieval.js'
import { cleanup, testConfig, testDb } from '../helpers/test-utils.js'
import { buildTestServer } from '../helpers/server-utils.js'
import { ChatService } from '../../src/core/chat.js'
import { AiSettingsStore } from '../../src/core/ai-settings.js'

test('text and Word extract offline with strict formats, Unicode and bounded XML', () => {
  assert.equal(extractDocument(Buffer.from('中文 Alpha\n\nBeta'), 'study.TXT').pages, 2)
  assert.match(extractDocument(Buffer.from('\ufeff日本語', 'utf16le'), 'study.txt').text, /日本語/)
  assert.equal(extractDocument(Buffer.from('```js\nconst a=1\n\nconst b=2\n```'),'code.md').pages,1)
  const docx = Buffer.from(zipSync({'word/document.xml':strToU8('<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>中文标题</w:t></w:r></w:p><w:p><w:r><w:t>Alpha &amp; Beta</w:t></w:r></w:p></w:body></w:document>')}))
  const extracted=extractDocument(docx,'study.docx')
  assert.equal(extracted.pages,2);assert.match(extracted.text,/# 中文标题/);assert.match(extracted.text,/Alpha & Beta/)
  for (const [bytes,name] of [[Buffer.from('bad'),'bad.docx'],[Buffer.from('bad'),'old.doc'],[Buffer.from([255]),'bad.txt'],[Buffer.from(' '),'empty.md']] as const) assert.throws(()=>extractDocument(bytes,name))
  const oversized=Buffer.from(zipSync({'word/document.xml':new Uint8Array(8*1024*1024+1)}))
  assert.throws(()=>extractDocument(oversized,'large.docx'))
})

test('text documents reach AI requests with paragraph citations instead of fake PDF attachments',async()=>{
  const config=testConfig(),db=testDb(config),originalFetch=globalThis.fetch
  try {
    const project=new ProjectService(db).create('AI Text'),source=await new SourceService(db,config).addFile(project.id,Buffer.from('Alpha\n\nResearch Beta'),'study.txt')
    new AiSettingsStore(config).saveApi('api-compatible',{baseUrl:'http://localhost:1234/v1',model:'synthetic',apiKey:'synthetic'})
    let prompt=''
    globalThis.fetch=async(_url,init)=>{prompt=JSON.parse(String(init?.body)).messages[0].content;return new Response(JSON.stringify({choices:[{message:{content:'Synthetic answer [1]'}}]}),{headers:{'content-type':'application/json'}})}
    const answer=await new ChatService(db,config).ask(project.id,'Beta',{agent:'api-compatible',sourceSelectors:[source.id],contextScope:'document'})
    assert.match(prompt,/Research Beta/);assert.match(prompt,/paragraph 2/)
    assert.equal(answer.references![0].locationUnit,'paragraph');assert.equal(answer.references![0].page,2);assert.equal(answer.references![0].canJump,true)
  }finally{globalThis.fetch=originalFetch;cleanup(config,db)}
})

test('managed originals, paragraph retrieval and progress survive reindex and database reopen', async()=>{
  const config=testConfig();let db=testDb(config)
  try {
    const project=new ProjectService(db).create('Documents'),service=new SourceService(db,config),bytes=Buffer.from('# Alpha\n\nResearch Beta')
    const source=await service.addFile(project.id,bytes,'paper.md')
    assert.equal(source.type,'text');assert.deepEqual(fs.readFileSync(service.pdfPath(source)!),bytes)
    assert.equal(new RetrievalService(db).search(project.id,'Beta')[0].page_number,2)
    service.setLastPageRead(project.id,source.id,2);await service.reindex(project.id,source.id,true)
    assert.equal(service.resolve(project.id,source.id).last_page_read,2)
    db.close();db=testDb(config);assert.equal(new SourceService(db,config).resolve(project.id,source.id).pages,2)
    new SourceService(db,config).remove(project.id,source.id);assert.equal(fs.existsSync(service.pdfPath(source)||''),false)
  }finally{cleanup(config,db)}
})

test('upload accepts text, downloads original bytes and rejects unsupported files without adding sources',async()=>{
  const config=testConfig(),app=await buildTestServer(config)
  try {
    const project=(await app.inject({method:'POST',url:'/api/projects',payload:{title:'Imports'}})).json()
    const upload=async(name:string,text:string)=>app.inject({method:'POST',url:`/api/projects/${project.id}/sources/upload`,headers:{'content-type':'multipart/form-data; boundary=test-boundary'},payload:Buffer.from(`--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n${text}\r\n--test-boundary--\r\n`)})
    const response=await upload('notes.txt','Alpha\n\nBeta');assert.equal(response.statusCode,200)
    const original=await app.inject(`/api/projects/${project.id}/sources/${response.json().id}/file`);assert.equal(original.body,'Alpha\n\nBeta');assert.match(original.headers['content-type']!,/text\/plain/)
    assert.equal((await upload('bad.doc','bad')).statusCode,400)
    assert.equal((await app.inject(`/api/projects/${project.id}/sources`)).json().length,1)
  }finally{await app.close();cleanup(config,{close(){}} as never)}
})
