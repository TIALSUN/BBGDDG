import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {localRequests} from './test-api.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(repo,'package.json'));
const {_electron}=require('playwright'),{expect}=require('@playwright/test'),{zipSync,strToU8}=require('fflate');
const target=process.argv[2];
if(!target)throw Error('Pass packaged BBGDDG.exe');
const userData=fs.mkdtempSync(path.join(path.dirname(repo),'desktop-document-test-'));
const launch=()=>_electron.launch({executablePath:target,env:{...process.env,BBGDDG_DESKTOP_USER_DATA_DIR:userData},timeout:60000});
let app=await launch(),project,source,note;
try {
 const page=await app.firstWindow();await page.getByRole('heading',{name:'我的项目'}).waitFor({timeout:60000});
 const origin=new URL(page.url()).origin,api=localRequests(page,origin);
 project=await (await api.post(origin+'/api/projects',{data:{title:'多格式桌面测试'}})).json();
 for(const [name,buffer] of [['study.md',Buffer.from('# Alpha\n\nResearch Beta')],['study.txt',Buffer.from('纯文本')],['study.docx',Buffer.from(zipSync({'word/document.xml':strToU8('<w:document xmlns:w="urn:w"><w:p><w:r><w:t>Word paragraph</w:t></w:r></w:p></w:document>')}))]]) {
  const response=await api.post(`${origin}/api/projects/${project.id}/sources/upload`,{multipart:{file:{name,mimeType:'application/octet-stream',buffer}}});
  assert.equal(response.status(),200);const added=await response.json();assert.equal(added.type,'text');
  if(name==='study.md')source=added;
 }
 await page.goto(`${origin}/projects/${project.id}/sources/${source.id}`);
 await expect(page.getByRole('heading',{name:'Alpha',exact:true})).toBeVisible();
 await expect(page.locator('[data-paragraph="2"]')).toContainText('Research Beta');
 note=await (await api.post(`${origin}/api/projects/${project.id}/notes`,{data:{source_id:source.id,title:'段落笔记',content:'保留这条笔记',anchors:[{sourceId:source.id,page:2,text:'Research Beta',unit:'paragraph',rects:[]}]}})).json();
 await app.close();app=await launch();
 const reopened=await app.firstWindow();await reopened.getByRole('heading',{name:'我的项目'}).waitFor({timeout:60000});
 const origin2=new URL(reopened.url()).origin,api2=localRequests(reopened,origin2);
 const saved=await (await api2.get(`${origin2}/api/projects/${project.id}/notes/${note.id}`)).json();assert.equal(saved.anchors[0].unit,'paragraph');assert.equal(saved.content,'保留这条笔记');
 await reopened.goto(`${origin2}/projects/${project.id}/sources/${source.id}?mode=notes&note=${note.id}`);
 await reopened.getByRole('button',{name:/回到原文.*第 2 段/}).click();
 await expect(reopened.locator('[data-paragraph="2"]')).toHaveClass(/is-target/);
 await reopened.screenshot({path:path.join(userData,'text-reader.png')});
 console.log(JSON.stringify({formats:['MD','TXT','DOCX'],packagedImport:'passed',restartNotePersistence:'passed',paragraphJump:'passed',userData}));
}finally{await app.close()}
