import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { AgentService } from '../../src/core/agents.js'
import { AiSettingsStore } from '../../src/core/ai-settings.js'
import { parseCliAnswer } from '../../src/core/ai-cli.js'
import { PdfpalError } from '../../src/core/types.js'
import { testConfig } from '../helpers/test-utils.js'

test('CLI adapters use stdin, official flags and persisted actual usage', async () => {
  const config = testConfig(), settings = new AiSettingsStore(config)
  try {
    const capture = path.join(config.dataDir, 'capture.json')
    const outputs = {
      codex: [{ type: 'item.completed', item: { type: 'agent_message', text: '中文回答' } }, { type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 60 } }],
      claude: { result: '中文回答', usage: { input_tokens: 20, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 }, modelUsage: { 'claude-test': {} }, total_cost_usd: 0.01 },
      'deepseek-harness': [{ type: 'status', phase: 'step_end', usage: { inputTokens: 100, outputTokens: 20 } }, { type: 'status', phase: 'step_end', usage: { inputTokens: 150, outputTokens: 30 } }, { type: 'final', text: '中文回答' }],
      workbuddy: '中文回答',
      opencode: [{type:'text',part:{type:'text',text:'中文回答'}}],
    }
    for (const [id, output] of Object.entries(outputs)) {
      const entry = path.join(config.dataDir, id + '.mjs')
      fs.writeFileSync(entry, `import fs from 'node:fs';let input='';for await(const chunk of process.stdin)input+=chunk;fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),input}));console.log(${JSON.stringify(typeof output === 'string' ? output : JSON.stringify(output))});`)
      settings.saveCli(id, { command: entry, model: 'selected-model', args: ['--verified-headless'] })
      assert.equal(new AgentService(config).list().find(agent => agent.id === id)?.available, true)
      const result = await new AgentService(config).invokeDetailed('引用本地 PDF；$(literal)', id as never)
      assert.equal(result.answer, '中文回答')
      const { args, input } = JSON.parse(fs.readFileSync(capture, 'utf8'))
      assert.equal(id==='opencode' ? args.at(-1) : input, '引用本地 PDF；$(literal)')
      if (id === 'codex') assert.deepEqual(args, ['--ask-for-approval', 'never', 'exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', 'selected-model', '-'])
      if (id === 'claude') { assert.ok(args.includes('--output-format')); assert.ok(args.includes('dontAsk')); assert.equal(result.usage.model, 'claude-test'); assert.equal(result.usage.inputTokens, 80) }
      if (id === 'deepseek-harness') { assert.deepEqual(args, ['--profile', 'headless', '--json', '-']); assert.equal(result.usage.totalTokens, 300); assert.notEqual(result.usage.model, 'selected-model') }
      if (id === 'workbuddy') { assert.deepEqual(args, ['--verified-headless']); assert.equal(result.usage.totalTokens, undefined) }
      assert.equal(settings.usage(id).calls, 1)
    }
  } finally { fs.rmSync(config.dataDir, { recursive: true, force: true }) }
})

test('missing commands and failed processes never produce successful usage or leak stderr', async () => {
  const config = testConfig()
  try {
    config.claudeBin = path.join(config.dataDir, 'missing.exe')
    await assert.rejects(new AgentService(config).invoke('prompt'), (error: unknown) => error instanceof PdfpalError && error.code === 'AGENT_NOT_FOUND')
    const file = path.join(config.dataDir, 'failed.mjs')
    fs.writeFileSync(file, `process.stdin.resume();console.log('partial answer');console.error('sk-secret-do-not-expose');process.exitCode=2`)
    config.claudeBin = file
    await assert.rejects(new AgentService(config).invoke('prompt'), (error: unknown) => error instanceof PdfpalError && error.code === 'AGENT_FAILED' && !error.message.includes('sk-secret'))
    assert.equal(new AiSettingsStore(config).usage('claude').calls, 0)
  } finally { fs.rmSync(config.dataDir, { recursive: true, force: true }) }
})

test('partial Harness usage is unknown and failed JSON responses cannot become answers', () => {
  const result = parseCliAnswer('deepseek-harness', JSON.stringify([{ type:'status',phase:'step_end',usage:{inputTokens:2,outputTokens:3} }, {type:'status',phase:'step_end'}, {type:'final',text:'done'}]), '')
  assert.equal(result.usage.totalTokens, undefined)
  assert.throws(() => parseCliAnswer('claude', JSON.stringify({ result:'error',is_error:true }), ''), /未完成回答/)
  assert.throws(() => parseCliAnswer('codex', JSON.stringify({ type:'turn.failed' }), ''), /未完成回答/)
})
