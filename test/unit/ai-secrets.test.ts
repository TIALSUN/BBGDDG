import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { agentEnvironment, initializeDesktopMasterKey } from '../../src/core/ai-secrets.js'
import { AiSettingsStore } from '../../src/core/ai-settings.js'
import { AgentService } from '../../src/core/agents.js'
import { testConfig } from '../helpers/test-utils.js'

test('AI tools cannot inherit BBGDDG encryption keys or session credentials', async () => {
 const config=testConfig(),entry=path.join(config.dataDir,'env-probe.mjs')
 const oldMaster=process.env.BBGDDG_AI_SECRET_KEY,oldSession=process.env.BBGDDG_SESSION_TOKEN
 try {
  process.env.BBGDDG_AI_SECRET_KEY='synthetic-internal-master';process.env.BBGDDG_SESSION_TOKEN='synthetic-internal-session'
  fs.writeFileSync(entry,"process.stdin.resume();console.log(JSON.stringify({result:JSON.stringify(Object.keys(process.env).filter(key=>/^bbgddg_/i.test(key)))}))")
  config.claudeBin=entry
  assert.deepEqual(JSON.parse(await new AgentService(config).invoke('test','claude')),[])
  const filtered=agentEnvironment({Bbgddg_ai_secret_key:'private',BBGDDG_DATA_DIR:'private-path',PDFPAL_AI_SECRET_KEY:'legacy-private',PATH:'kept',ANTHROPIC_API_KEY:'synthetic-tool-owned'})
  assert.deepEqual(filtered,{PATH:'kept',ANTHROPIC_API_KEY:'synthetic-tool-owned'})
 }finally{if(oldMaster===undefined)delete process.env.BBGDDG_AI_SECRET_KEY;else process.env.BBGDDG_AI_SECRET_KEY=oldMaster;if(oldSession===undefined)delete process.env.BBGDDG_SESSION_TOKEN;else process.env.BBGDDG_SESSION_TOKEN=oldSession;fs.rmSync(config.dataDir,{recursive:true,force:true})}
})

test('private in-memory desktop key preserves encrypted settings without a plaintext fallback key', () => {
 const config=testConfig()
 try {
  initializeDesktopMasterKey('a'.repeat(64))
  const store=new AiSettingsStore(config);store.saveApi('api-compatible',{baseUrl:'https://example.com/v1',model:'test',apiKey:'synthetic-encryption-test'})
  assert.equal(new AiSettingsStore(config).secret(store.profile('api-compatible')),'synthetic-encryption-test')
  assert.equal(fs.existsSync(path.join(config.dataDir,'.ai-secret-key')),false)
  assert.ok(!fs.readFileSync(path.join(config.dataDir,'ai-settings.json'),'utf8').includes('synthetic-encryption-test'))
  assert.throws(()=>initializeDesktopMasterKey('b'.repeat(64)))
 }finally{fs.rmSync(config.dataDir,{recursive:true,force:true})}
})
