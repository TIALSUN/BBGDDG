import fs from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {createProjectViaApi} from './helpers';

async function fixture(page:Page){
 const project=await createProjectViaApi(page,'阅读记忆与引用');
 const upload=async(name:string)=>(await (await page.request.post(`/api/projects/${project.id}/sources/upload`,{multipart:{file:{name,mimeType:'application/pdf',buffer:fs.readFileSync(new URL('../../test/fixtures/sample.pdf',import.meta.url))}}})).json());
 const source=await upload('引用测试.pdf'),second=await upload('另一份文献.pdf');
 await page.goto(`/projects/${project.id}/sources/${source.id}`);
 await expect(page.locator('[data-pdf-page="1"] .textLayer span').first()).toBeVisible();
 await page.getByRole('button',{name:'AI 问答',exact:true}).click();
 return {project,source,second};
}
const answer=(references:any[]=[])=>'data: '+JSON.stringify({text:'根据原文 [1]。未知引用 [99]。代码 `[1]`。',references,contextScope:'document'})+'\n\ndata: [DONE]\n\n';
test('collection creation works without browser prompt and preserves errors',async({page})=>{
 const project=await createProjectViaApi(page,'文献集创建回归');await page.goto(`/projects/${project.id}`);
 await page.evaluate(()=>{window.prompt=()=>{throw new Error('Desktop prompt unsupported')}});
 await page.getByRole('button',{name:'📁 新建文献集',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'新建文献集'});await expect(dialog).toBeVisible();
 await dialog.getByLabel('文献集名称').fill('回归测试文献集');await dialog.getByRole('button',{name:'创建文献集',exact:true}).click();await expect(dialog).toBeHidden();
 const collections=await(await page.request.get(`/api/projects/${project.id}/collections`)).json();expect(collections.some((c:any)=>c.name==='回归测试文献集')).toBe(true);
 await page.route(`**/api/projects/${project.id}/collections`,route=>route.request().method()==='POST'?route.fulfill({status:500,json:{detail:'合成创建失败'}}):route.continue());
 await page.getByRole('button',{name:'📁 新建文献集',exact:true}).click();await dialog.getByLabel('文献集名称').fill('保留名称');await dialog.getByRole('button',{name:'创建文献集',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('合成创建失败');await expect(dialog.getByLabel('文献集名称')).toHaveValue('保留名称');await dialog.getByRole('button',{name:'取消',exact:true}).click();
});
test('saved note preview renders math without changing stored content',async({page})=>{
 const {project,source}=await fixture(page),content=String.raw`行内 \(E=mc^2\)\n\[a=\frac{1}{2}\]`;
 const note=await(await page.request.post(`/api/projects/${project.id}/notes`,{data:{title:'公式笔记',content,source_id:source.id}})).json();
 await page.goto(`/projects/${project.id}/sources/${source.id}?mode=notes&note=${note.id}`);await expect(page.locator('.note-body .katex')).toHaveCount(2);
 const saved=await(await page.request.get(`/api/projects/${project.id}/notes/${note.id}`)).json();expect(saved.content).toBe(content);
});
test('common model math delimiters render while code stays literal',async({page})=>{
 await fixture(page);await page.route('**/api/chat',route=>route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({text:String.raw`行内 \(x^2\) 和块公式 \[AEC=\frac{1}{N}\sum_i E_i\]。代码 \`literal\``,contextScope:'document'})+'\n\ndata: [DONE]\n\n'}));
 await page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）').fill('解释公式');await page.getByRole('button',{name:'发送问题'}).click();await expect(page.locator('.chat-answer .katex')).toHaveCount(2);await expect(page.locator('.chat-answer .katex-display')).toHaveCount(1);
});
test('pending answer survives SPA document switches and can be stopped',async({page})=>{
 const {project,source,second}=await fixture(page);let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve});
 await page.route('**/api/chat',async route=>{await pending;await route.fulfill({contentType:'text/event-stream',body:answer()}).catch(()=>{})});
 const input=page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）');await input.fill('切换时继续思考');await input.press('Enter');await expect(page.getByRole('button',{name:'停止生成'})).toBeVisible();
 const navigate=async(id:string)=>{await page.evaluate(url=>{history.pushState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'))},`/projects/${project.id}/sources/${id}`);await page.getByRole('button',{name:'AI 问答',exact:true}).click()};
 await navigate(second.id);await expect(page.getByRole('button',{name:'停止生成'})).toBeHidden();await navigate(source.id);await expect(page.getByText('切换时继续思考',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'停止生成'})).toBeVisible();
 release();await expect(page.locator('.chat-answer')).toHaveCount(1);
 let finish!:()=>void;const waiting=new Promise<void>(resolve=>{finish=resolve});await page.route('**/api/chat',async route=>{await waiting;await route.fulfill({contentType:'text/event-stream',body:answer()}).catch(()=>{})});
 await input.fill('停止这个请求');await input.press('Enter');await page.getByRole('button',{name:'停止生成'}).click();await expect(input).toBeEnabled();await expect(input).toHaveValue('停止这个请求');await expect(page.getByText(/已停止生成/)).toBeVisible();finish();
});
test('editable memory survives reload; clear and pause are explicit',async({page})=>{
 const {project,source}=await fixture(page);
 await page.getByRole('button',{name:/对话记忆/}).click();
 await expect(page.getByLabel('记忆摘要')).toBeEnabled();
 await page.getByLabel('记忆摘要').fill('我的研究结论：先掌握基本概念。');
 await page.getByLabel('自动整理较早对话').uncheck();
 await page.getByRole('button',{name:'保存记忆'}).click();
 await expect(page.getByText('尚未保存', {exact:true})).toBeHidden();
 await page.reload();await page.getByRole('button',{name:'AI 问答',exact:true}).click();
 await expect(page.getByRole('button',{name:/对话记忆/})).toContainText('自动整理已暂停');
 await page.getByRole('button',{name:/对话记忆/}).click();
 await expect(page.getByLabel('记忆摘要')).toHaveValue('我的研究结论：先掌握基本概念。');
 await page.getByRole('button',{name:'清空摘要'}).click();await expect(page.getByLabel('记忆摘要')).toHaveValue('');
 const memory=await(await page.request.get(`/api/projects/${project.id}/sources/${source.id}/memory`)).json();expect(memory.summary).toBe('');expect(memory.enabled).toBe(false);
 const inputBox=await page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）').boundingBox();expect(inputBox!.y+inputBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);await expect(page.locator('[data-pdf-page="1"]')).toHaveAttribute('data-pdf-ready','true');
 await page.screenshot({path:test.info().outputPath('memory-editor.png')});
});
test('scope selector sends only its selected scope and retains selection across followups',async({page})=>{
 await fixture(page);const requests:any[]=[];
 await page.route('**/api/chat',route=>{requests.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'text/event-stream',body:answer()})});
 await expect(page.getByLabel('问答范围')).toHaveValue('document');
 await page.getByLabel('问答范围').selectOption('project');
 const input=page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）');
 await input.fill('比较项目文献');await page.getByRole('button',{name:'发送问题'}).click();await expect(page.locator('.chat-answer')).toHaveCount(1);
 expect(requests[0].context_scope).toBe('project');expect(requests[0].selected_text).toBeUndefined();
 await page.locator('[data-pdf-page="1"] .textLayer span').first().evaluate(span=>{const range=document.createRange();range.selectNodeContents(span);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.getByRole('button',{name:'提问',exact:true}).click();await expect(page.getByLabel('问答范围')).toHaveValue('selection');
 await input.fill('解释选文');await input.press('Enter');await expect(page.locator('.chat-answer')).toHaveCount(2);
 expect(requests[1].context_scope).toBe('selection');expect(requests[1].selected_text).toContain('Test page 1');
 await input.fill('继续解释');await input.press('Enter');await expect(page.locator('.chat-answer')).toHaveCount(3);expect(requests[2].selected_text).toBe(requests[1].selected_text);
});
test('known citations jump to the actual PDF page and match text without saving an annotation',async({page})=>{
 const {source}=await fixture(page);
 const ref={id:1,sourceId:source.id,title:source.title,page:2,excerpt:'Test page 2',canJump:true};
 await page.route('**/api/chat',route=>route.fulfill({status:200,contentType:'text/event-stream',body:answer([ref])}));
 const input=page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）');await input.fill('阅读引用');await input.press('Enter');
 await expect(page.locator('.citation-link')).toHaveCount(1);await expect(page.locator('.chat-answer code')).toHaveText('[1]');
 await page.getByRole('button',{name:'[1]',exact:true}).click();
 await expect(page.getByTestId('page-progress')).toHaveText('第 2 页 / 共 2 页');
 await expect(page.locator('[data-citation-highlight]')).not.toHaveCount(0);expect(await page.locator('[data-annotation-id]').count()).toBe(0);
 const rect=await page.locator('[data-citation-highlight]').first().boundingBox();expect(rect!.width).toBeGreaterThan(5);expect(rect!.height).toBeGreaterThan(5);
 await page.screenshot({path:test.info().outputPath('citation-jump.png')});
});
test('cross-document citation opens its own document and highlights the referenced passage',async({page})=>{
 const {project,second}=await fixture(page);
 await page.route('**/api/chat',route=>route.fulfill({status:200,contentType:'text/event-stream',body:answer([{id:1,sourceId:second.id,title:second.title,page:2,excerpt:'Test page 2',canJump:true}])}));
 await page.getByLabel('问答范围').selectOption('project');const input=page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）');await input.fill('引用另一份文献');await input.press('Enter');
 await page.getByRole('button',{name:'[1]',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/sources/${second.id}$`));await expect(page.getByTestId('page-progress')).toHaveText('第 2 页 / 共 2 页');await expect(page.locator('[data-citation-highlight]')).not.toHaveCount(0);
});
test('history citations remain clickable and a failed request preserves the question',async({page})=>{
 const {project,source}=await fixture(page);
 await page.route(`**/api/projects/${project.id}/sources/${source.id}/chat`,route=>route.fulfill({json:{messages:[{role:'assistant',content:'保存的引用 [1]',references:[{id:1,sourceId:source.id,title:source.title,page:2,excerpt:'Test page 2',canJump:true}],contextScope:'document'}]}}));
 await page.reload();await page.getByRole('button',{name:'AI 问答',exact:true}).click();await expect(page.locator('.citation-link')).toHaveCount(1);
 await page.route('**/api/chat',route=>route.fulfill({status:400,json:{detail:'合成测试：服务暂不可用'}}));const input=page.getByPlaceholder('输入问题…（Enter 发送，Shift+Enter 换行）');await input.fill('不要丢失的问题');await input.press('Enter');await expect(input).toHaveValue('不要丢失的问题');await expect(page.getByText('⚠️ 合成测试：服务暂不可用')).toBeVisible();
});
test('project chat exposes independent memory and cross-document citations',async({page})=>{
 const {project,source}=await fixture(page);await page.goto(`/projects/${project.id}/chat`);await page.getByRole('button',{name:/对话记忆/}).click();await expect(page.getByLabel('记忆摘要')).toBeEnabled();await page.getByLabel('记忆摘要').fill('项目级研究目标');await page.getByRole('button',{name:'保存记忆'}).click();await expect(page.getByText('尚未保存',{exact:true})).toBeHidden();
 const docMemory=await(await page.request.get(`/api/projects/${project.id}/sources/${source.id}/memory`)).json();expect(docMemory.summary).toBe('');const memory=await(await page.request.get(`/api/projects/${project.id}/memory`)).json();expect(memory.summary).toBe('项目级研究目标');
 await page.route('**/api/chat',route=>route.fulfill({status:200,contentType:'text/event-stream',body:answer([{id:1,sourceId:source.id,title:source.title,page:2,excerpt:'Test page 2',canJump:true}])}));const input=page.getByPlaceholder(/针对 .* 篇文献提问/);await input.fill('项目级问题');await input.press('Enter');await page.getByRole('button',{name:'[1]',exact:true}).click();await expect(page.getByTestId('page-progress')).toHaveText('第 2 页 / 共 2 页');
});
