import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildServer } from '../../src/server/app.js'
import { testConfig } from '../helpers/test-utils.js'
const token = 'b'.repeat(64)

test('local data and AI routes require authorization and reject spoofed hosts and origins', async () => {
 const config=testConfig(),app=await buildServer(config,{accessToken:token})
 try {
  for(const url of ['/api/health','/api/projects','/api/ai/settings','/api/agents','/'])assert.equal((await app.inject({url})).statusCode,401)
  assert.equal((await app.inject({url:'/api/projects',headers:{'x-bbgddg-token':'wrong'}})).statusCode,401)
  assert.equal((await app.inject({url:'/api/projects',headers:{'x-bbgddg-token':'中'.repeat(64)}})).statusCode,401)
  assert.equal((await app.inject({url:'/api/projects',headers:{host:'localhost:99999'}})).statusCode,403)
  const trusted={host:'localhost:80','x-bbgddg-token':token}
  assert.equal((await app.inject({url:'/api/projects',headers:trusted})).statusCode,200)
  assert.equal((await app.inject({url:'/api/projects',headers:{...trusted,host:'evil.example:80'}})).statusCode,403)
  assert.equal((await app.inject({method:'PUT',url:'/api/ai/api/api-compatible',headers:{...trusted,host:'evil.example:80',origin:'http://evil.example'},payload:{baseUrl:'https://example.com',model:'test'}})).statusCode,403)
  assert.equal((await app.inject({method:'POST',url:'/api/projects',headers:{...trusted,origin:'http://evil.example'},payload:{title:'blocked'}})).statusCode,403)
  assert.equal((await app.inject({method:'POST',url:'/api/projects',headers:{cookie:`bbgddg_session=${token}`},payload:{title:'blocked'}})).statusCode,403)
  const login=await app.inject({method:'POST',url:'/api/session',headers:trusted})
  assert.equal(login.statusCode,200);assert.match(String(login.headers['set-cookie']),/HttpOnly; SameSite=Strict/)
  const cookie=`bbgddg_session=${token}`
  assert.equal((await app.inject({url:'/api/projects',headers:{cookie}})).statusCode,200)
  const created=await app.inject({method:'POST',url:'/api/projects',headers:{cookie,origin:'http://localhost'},payload:{title:'allowed'}})
  assert.equal(created.statusCode,200)
  assert.equal((await app.inject({method:'DELETE',url:'/api/projects/'+created.json().id,headers:{cookie,origin:'null'}})).statusCode,403)
  assert.equal((await app.inject({url:'/api/projects',headers:{cookie,'sec-fetch-site':'cross-site'}})).statusCode,403)
  const unlock=await app.inject({url:'/unlock'});assert.equal(unlock.statusCode,200);assert.ok(!unlock.body.includes(token));assert.match(String(unlock.headers['content-security-policy']),/nonce-/)
  assert.match(String(login.headers['content-security-policy']),/frame-ancestors 'none'/)
  const other=await buildServer(testConfig(),{accessToken:'c'.repeat(64)});try{assert.equal((await other.inject({url:'/api/projects',headers:trusted})).statusCode,401)}finally{await other.close()}
 }finally{await app.close();fs.rmSync(config.dataDir,{recursive:true,force:true})}
})
