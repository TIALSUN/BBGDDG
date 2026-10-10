import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {once} from 'node:events'
import fs from 'node:fs'
import {buildServer} from '../../src/server/app.js'
import {AiSettingsStore} from '../../src/core/ai-settings.js'
import {testConfig} from '../helpers/test-utils.js'
test('disconnect cancels upstream generation and does not persist an answer',async()=>{
 const config=testConfig(),token='c'.repeat(64);let accepted!:()=>void,closed!:()=>void
 const received=new Promise<void>(resolve=>{accepted=resolve}),disconnected=new Promise<void>(resolve=>{closed=resolve})
 const upstream=http.createServer((request,response)=>{request.resume();response.on('close',closed);accepted()});upstream.listen(0,'127.0.0.1');await once(upstream,'listening')
 const settings=new AiSettingsStore(config);settings.saveApi('api-compatible',{baseUrl:`http://127.0.0.1:${(upstream.address() as any).port}/v1`,model:'test',apiKey:'synthetic-key'})
 const app=await buildServer(config,{accessToken:token});await app.listen({host:'127.0.0.1',port:0});const base=`http://127.0.0.1:${(app.server.address() as any).port}`,headers={'x-bbgddg-token':token,'content-type':'application/json'}
 try{
  const project=await(await fetch(base+'/api/projects',{method:'POST',headers,body:JSON.stringify({title:'取消测试'})})).json() as any
  const upload=new FormData();upload.append('file',new Blob([fs.readFileSync(new URL('../fixtures/sample.pdf',import.meta.url))],{type:'application/pdf'}),'sample.pdf')
  const source=await(await fetch(`${base}/api/projects/${project.id}/sources/upload`,{method:'POST',headers:{'x-bbgddg-token':token},body:upload})).json() as any
  const controller=new AbortController();const request=fetch(base+'/api/chat',{method:'POST',headers,signal:controller.signal,body:JSON.stringify({message:'取消问题',project_id:project.id,source_id:source.id,agent:'api-compatible'})});const rejected=assert.rejects(request,{name:'AbortError'})
  await received;controller.abort();await rejected;await Promise.race([disconnected,new Promise((_,reject)=>setTimeout(()=>reject(new Error('upstream not cancelled')),3000).unref())])
  const history=await(await fetch(`${base}/api/projects/${project.id}/sources/${source.id}/chat`,{headers})).json() as any;assert.deepEqual(history.messages,[])
 }finally{upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));await app.close();fs.rmSync(config.dataDir,{recursive:true,force:true})}
})
