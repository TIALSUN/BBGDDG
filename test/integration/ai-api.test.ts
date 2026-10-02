import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { buildServer } from '../../src/server/app.js'
import { AiSettingsStore, validateBaseUrl } from '../../src/core/ai-settings.js'
import { ApiAgent } from '../../src/core/ai-api.js'
import { AgentService } from '../../src/core/agents.js'
import { testConfig } from '../helpers/test-utils.js'

test('API settings, PDF context and usage persist without exposing keys', async () => {
  const config = testConfig(), key = 'synthetic-test-key-not-a-real-credential'
  const calls: { url: string; headers: http.IncomingHttpHeaders; body: any }[] = []
  let errorCode=0, redirect=false
  const mock = http.createServer(async (req,res) => {
    let text='';for await(const chunk of req)text+=chunk
    calls.push({url:req.url!,headers:req.headers,body:text ? JSON.parse(text) : undefined})
    res.setHeader('Content-Type','application/json')
    if(redirect){res.writeHead(302,{location:'/elsewhere'});res.end();return}
    if(errorCode){res.statusCode=errorCode;res.end(JSON.stringify({error:key}));return}
    res.end(JSON.stringify(req.url?.endsWith('/models') ? {data:[{id:'test-model'}]} : req.url?.endsWith('/messages') ? {model:'claude-test-model',content:[{type:'text',text:'本地文献的中文回答'}],usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:20,cache_creation_input_tokens:3}} : {model:'test-model-returned',choices:[{message:{content:'本地文献的中文回答'}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:60}}}))
  })
  mock.listen(0,'127.0.0.1');await once(mock,'listening')
  const base = `http://127.0.0.1:${(mock.address() as any).port}/v1`
  let app = await buildServer(config)
  const settings = new AiSettingsStore(config)
  try {
    const put = await app.inject({method:'PUT',url:'/api/ai/api/api-compatible',payload:{baseUrl:base,model:'test-model',apiKey:key}})
    assert.equal(put.statusCode,200);assert.equal(put.json().api.find((p:any)=>p.id==='api-compatible').hasKey,true)
    assert.ok(!put.body.includes(key));assert.ok(!put.body.includes('encryptedKey'))
    assert.ok(!fs.readFileSync(path.join(config.dataDir,'ai-settings.json'),'utf8').includes(key))
    const probe = await app.inject({method:'POST',url:'/api/ai/api/api-compatible/test'})
    assert.equal(probe.statusCode,200);assert.deepEqual(probe.json().models,['test-model']);assert.equal(calls[0].url,'/v1/models');assert.equal(calls[0].body,undefined)
    assert.equal((await app.inject({method:'PUT',url:'/api/ai/default',payload:{provider:'api-compatible'}})).statusCode,200)
    const project = (await app.inject({method:'POST',url:'/api/projects',payload:{title:'AI API 验证'}})).json()
    const sourceResponse = await app.inject({method:'POST',url:`/api/projects/${project.id}/sources`,payload:{url:path.resolve('test/fixtures/sample.pdf')}})
    const source=sourceResponse.json();assert.ok(source.id,sourceResponse.body)
    const ask = await app.inject({method:'POST',url:'/api/chat',payload:{project_id:project.id,source_id:source.id,message:'Test page 的内容是什么？'}})
    assert.equal(ask.statusCode,200);assert.match(ask.body,/本地文献的中文回答/);assert.match(ask.body,/"totalTokens":120/)
    const generation = calls.find(call=>call.url.endsWith('/chat/completions'))!
    assert.equal(generation.headers.authorization,`Bearer ${key}`);assert.match(generation.body.messages[0].content,/Test page/)
    assert.ok(!generation.body.messages[0].content.includes('Local documents available in your current working directory'))
    let history = (await app.inject({method:'GET',url:`/api/projects/${project.id}/sources/${source.id}/chat`})).json()
    assert.equal(history.messages[1].usage.model,'test-model-returned');assert.equal(history.messages[1].usage.totalTokens,120)
    await app.close();app = await buildServer(config)
    history = (await app.inject({method:'GET',url:`/api/projects/${project.id}/sources/${source.id}/chat`})).json()
    assert.equal(history.messages[1].usage.totalTokens,120);assert.equal(settings.defaultProvider(),'api-compatible')
    assert.equal(new AgentService(config).list().find(agent=>agent.id==='api-compatible')!.usage.totalTokens,120)
    settings.saveApi('api-compatible',{baseUrl:base,model:'changed-model'});assert.equal(settings.secret(settings.profile('api-compatible')),key)
    settings.saveApi('api-claude',{baseUrl:base,model:'claude-test',apiKey:key})
    const claude = await new ApiAgent(settings).invoke('api-claude','验证中文')
    assert.equal(claude.usage.inputTokens,33);assert.equal(claude.usage.totalTokens,38)
    const claudeCall = calls.at(-1)!;assert.equal(claudeCall.url,'/v1/messages');assert.equal(claudeCall.headers['x-api-key'],key);assert.equal(claudeCall.body.max_tokens,4096)
    errorCode=401;await assert.rejects(new ApiAgent(settings).invoke('api-compatible','fail'),(error:any)=>error.message.includes('401')&&!error.message.includes(key));errorCode=0
    redirect=true;await assert.rejects(new ApiAgent(settings).test('api-compatible'),/连接失败/);assert.notEqual(calls.at(-1)!.url,'/elsewhere');redirect=false
    assert.equal((await app.inject({method:'PUT',url:'/api/ai/api/api-compatible',headers:{origin:'https://untrusted.example'},payload:{baseUrl:base,model:'x',apiKey:key}})).statusCode,403)
    assert.equal((await app.inject({method:'PUT',url:'/api/ai/api/unknown',payload:{}})).statusCode,400)
    settings.saveApi('api-compatible',{baseUrl:base,model:'test-model',clearKey:true})
    assert.equal(settings.secret(settings.profile('api-compatible')),'');assert.equal(new AgentService(config).list().find(agent=>agent.id==='api-compatible')!.available,false)
    assert.equal((await app.inject({method:'PUT',url:'/api/ai/default',payload:{provider:'api-compatible'}})).statusCode,400)
    for(const url of ['http://example.com','https://user:secret@example.com','https://example.com?key=secret'])assert.throws(()=>validateBaseUrl(url))
  } finally { await app.close();await new Promise<void>(resolve=>mock.close(()=>resolve()));fs.rmSync(config.dataDir,{recursive:true,force:true}) }
})
