import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {localRequests} from './test-api.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(repo,'package.json'));
const {_electron}=require('playwright'),{expect}=require('@playwright/test'),Database=require('better-sqlite3'),{PDFDocument}=require('pdf-lib');
const executablePath=process.argv[2],oldExecutable=process.argv[3];
if(!executablePath)throw Error('Pass packaged BBGDDG.exe and optionally a legacy executable');
const userData=fs.mkdtempSync(path.join(path.dirname(repo),'desktop-ink-test-'));
const launch=target=>_electron.launch({executablePath:target,env:{...process.env,BBGDDG_DESKTOP_USER_DATA_DIR:userData},timeout:60000});
const ready=async app=>{const page=await app.firstWindow();await page.getByRole('heading',{name:'我的项目'}).waitFor({timeout:60000});const origin=new URL(page.url()).origin;return {page,origin,api:localRequests(page,origin)}};
let app,project,note,source;
const errors=[];
const noteContent='保留中文正文与公式 $x^2$';
try{
 app=await launch(oldExecutable||executablePath);
 let session=await ready(app);
 project=await(await session.api.post(session.origin+'/api/projects',{data:{title:'桌面手写升级验证'}})).json();
 source=await(await session.api.post(`${session.origin}/api/projects/${project.id}/sources/upload`,{multipart:{file:{name:'fixture.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(path.join(repo,'test/fixtures/sample.pdf'))}}})).json();
 note=await(await session.api.post(`${session.origin}/api/projects/${project.id}/notes`,{data:{title:'旧版笔记保留',content:noteContent,source_id:source.id}})).json();
 const annotationsUrl=`/api/projects/${project.id}/sources/${source.id}/annotations`;
 assert.equal((await session.api.post(session.origin+annotationsUrl,{data:{page_number:1,text:'legacy text',x1:.1,y1:.1,x2:.3,y2:.2,color:'yellow',note:'保留旧注释'}})).status(),200);
 await app.close();app=undefined;
 const dbPath=path.join(userData,'data/bbgddg.db');
 const before=new Database(dbPath,{readonly:true});const oldSchema=before.prepare('SELECT max(version) version FROM schema_migrations').get().version;before.close();
 app=await launch(executablePath);session=await ready(app);let {page,api,origin}=session;page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await app.evaluate(({app})=>app.getVersion()),JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8')).version);
 const saved=await(await api.get(`${origin}/api/projects/${project.id}/notes/${note.id}`)).json();assert.equal(saved.content,noteContent);
 assert.equal((await(await api.get(origin+annotationsUrl)).json())[0].note,'保留旧注释');
 if(oldSchema<11){
  const backups=fs.readdirSync(path.join(userData,'data/backups')).filter(name=>name.endsWith('.db')).sort();assert.ok(backups.length,'pre-migration backup required');
  const backup=new Database(path.join(userData,'data/backups',backups.at(-1)),{readonly:true});assert.equal(backup.prepare('SELECT max(version) version FROM schema_migrations').get().version,oldSchema);assert.equal(backup.prepare('SELECT content FROM notes WHERE id=?').get(note.id).content,noteContent);backup.close();
 }
 await page.goto(`${origin}/projects/${project.id}/notes/${note.id}`);
 await page.getByRole('button',{name:'添加手写块',exact:true}).click();await page.locator('.note-ink').getByRole('button',{name:'钢笔',exact:true}).click();
 async function draw(canvas){await expect(canvas).toBeVisible();await canvas.evaluate(el=>{const box=el.getBoundingClientRect();for(const [type,x,y] of [['pointerdown',.1,.1],['pointermove',.15,.15],['pointerup',.2,.2]])el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:17,pointerType:'mouse',clientX:box.left+box.width*x,clientY:box.top+box.height*y,pressure:.5}))})}
 await draw(page.locator('.note-ink [data-ink-canvas]').first());await expect(page.locator('.note-ink [data-ink-stroke]')).toHaveCount(1);await expect(page.getByText('手写已保存',{exact:true})).toBeVisible();
 await page.goto(`${origin}/projects/${project.id}/sources/${source.id}`);await page.getByLabel('PDF 阅读区',{exact:true}).getByRole('button',{name:'钢笔',exact:true}).click();
 const canvas=page.locator('[data-pdf-page="1"] [data-ink-canvas]');await draw(canvas);await expect(canvas.locator('[data-ink-stroke]')).toHaveCount(1);await expect(page.locator('[data-pdf-page="1"] .pdf-ink-status')).toContainText('手写已保存');
 const points=await canvas.locator('[data-ink-stroke]').getAttribute('points');
 const exported=await api.post(`${origin}/api/projects/${project.id}/exports`,{data:{kind:'source',id:source.id}});assert.equal(exported.status(),200);assert.equal((await PDFDocument.load(await exported.body())).getPageCount(),source.pages);
 const backup=await api.post(`${origin}/api/projects/${project.id}/backups`);assert.equal(backup.status(),200);
 const destination=await(await api.post(origin+'/api/projects',{data:{title:'桌面恢复目标'}})).json();
 const restored=await api.post(`${origin}/api/projects/${destination.id}/backups/restore`,{multipart:{file:{name:'notes.zip',mimeType:'application/zip',buffer:await backup.body()}}});assert.equal(restored.status(),200);assert.ok((await restored.json()).created>0);
 assert.ok((await(await api.get(`${origin}/api/projects/${destination.id}/ink/documents`)).json()).some(doc=>doc.blocks.some(block=>block.strokes.length)));
 await app.close();app=await launch(executablePath);session=await ready(app);({page,api,origin}=session);page.on('pageerror',e=>errors.push(e.message));
 const noteInk=await(await api.get(`${origin}/api/projects/${project.id}/ink?kind=note&noteId=${note.id}`)).json();assert.equal(noteInk.blocks[0].strokes.length,1);
 await page.goto(`${origin}/projects/${project.id}/sources/${source.id}`);await expect(page.locator('[data-pdf-page="1"] [data-ink-stroke]')).toHaveAttribute('points',points);
 assert.deepEqual(errors,[]);
 fs.mkdirSync(path.join(repo,'release/validation'),{recursive:true});await page.screenshot({path:path.join(repo,'release/validation/desktop-reader.png')});
 console.log(JSON.stringify({executable:executablePath,version:JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8')).version,legacySchema:oldSchema,legacyNotesAndAnnotations:'passed',migrationBackup:oldSchema<11?'passed':'not-needed',noteInk:'passed',pdfInk:'passed',restart:'passed',pdfExport:'passed',editableBackupRestore:'passed',pageErrors:errors,userData}));
}finally{await app?.close()}
