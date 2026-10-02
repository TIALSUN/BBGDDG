import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { BbgddgError } from './types.js'
import type { AiUsage, CliId } from './ai-settings.js'
import type { AgentAnswer } from './ai-api.js'

export function findCommand(command: string): string | undefined {
  if (!command) return undefined
  if (path.isAbsolute(command)) { try { return fs.statSync(command).isFile() ? command : undefined } catch { return undefined } }
  const result = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { windowsHide: true, encoding: 'utf8', timeout: 2000 })
  if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0]
  if (process.platform === 'win32') {
    for (const file of [path.join(os.homedir(), '.local', 'bin', command + '.exe'), path.join(process.env.APPDATA || '', 'npm', command + '.cmd')]) {
      try { if (fs.statSync(file).isFile()) return file } catch {}
    }
  }
  return undefined
}
export function launchCommand(command: string): { binary: string; prefix: string[] } {
  const file = findCommand(command)
  if (!file) throw new BbgddgError('AGENT_NOT_FOUND', '没有找到该工具的命令行。请安装工具或在 AI 设置中填写命令路径。', 2)
  if (/\.[cm]?js$/i.test(file)) return { binary: process.execPath, prefix: [file] }
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    // Resolve standard npm shims directly to Node. Prompt text never enters cmd.exe.
    const text = fs.readFileSync(file, 'utf8')
    const match = text.match(/%(?:dp0%|~dp0)[\\/]([^"\r\n]+\.[cm]?js)/i)
    const script = match && path.resolve(path.dirname(file), match[1]!)
    if (script && fs.existsSync(script)) return { binary: process.execPath, prefix: [script] }
    throw new BbgddgError('UNSUPPORTED_CLI_LAUNCHER', '此批处理启动器无法直接调用。请在 AI 设置中填写工具的 .exe 或 Node 脚本入口路径。', 2)
  }
  return { binary: file, prefix: [] }
}
export function detectWorkBuddyDesktop(): boolean {
  const roots = [path.join(process.env.LOCALAPPDATA || '', 'Programs'), process.env.LOCALAPPDATA || '', process.env.ProgramFiles || '', process.env['ProgramFiles(x86)'] || ''].filter(Boolean)
  return roots.some(root => {
    try { return fs.readdirSync(root).filter(name => /workbuddy/i.test(name)).some(name => fs.existsSync(path.join(root, name, 'WorkBuddy.exe'))) } catch { return false }
  })
}
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
export function parseCliAnswer(id: CliId, output: string, model: string): AgentAnswer {
  const usage: AiUsage = { provider: id, model: model || '工具默认模型（未回传名称）', recordedAt: new Date().toISOString() }
  let answer = ''
  let events: any[] = []
  try { const parsed = JSON.parse(output); events = Array.isArray(parsed) ? parsed : [parsed] } catch {
    events = output.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  }
  if (id === 'claude' || id === 'workbuddy') {
    const result = events.findLast(event => typeof event.result === 'string')
    if (result?.is_error) throw new BbgddgError('AGENT_FAILED', '工具未完成回答，请检查登录状态、模型和额度。', 2)
    if (result) {
      answer = result.result
      const models = Object.keys(result.modelUsage || {})
      if (models.length) usage.model = models.join(' + ')
      const raw = result.usage || {}
      const input = count(raw.input_tokens), output = count(raw.output_tokens)
      const read = count(raw.cache_read_input_tokens), write = count(raw.cache_creation_input_tokens)
      usage.inputTokens = input === undefined ? undefined : input + (read ?? 0) + (write ?? 0)
      usage.outputTokens = output; usage.cachedTokens = read
      usage.costUsd = count(result.total_cost_usd); usage.costEstimated = usage.costUsd !== undefined
    }
  } else if (id === 'codex') {
    answer = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').map(event => event.item.text || '').join('\n')
    const raw = events.findLast(event => event.type === 'turn.completed')?.usage
    if (raw) { usage.inputTokens = count(raw.input_tokens); usage.outputTokens = count(raw.output_tokens); usage.cachedTokens = count(raw.cached_input_tokens) }
    const returnedModel = events.findLast(event => typeof event.model === 'string')?.model
    if (returnedModel) usage.model = returnedModel
    if (events.some(event => event.type === 'turn.failed' || event.type === 'error')) throw new BbgddgError('AGENT_FAILED', 'Codex 未完成回答，请检查登录状态、模型和额度。', 2)
  } else if (id === 'deepseek-harness') {
    answer = events.findLast(event => event.type === 'final')?.text || ''
    const steps = events.filter(event => event.type === 'status' && event.phase === 'step_end')
    if (steps.length && steps.every(event => count(event.usage?.inputTokens) !== undefined && count(event.usage?.outputTokens) !== undefined)) {
      usage.inputTokens = steps.reduce((total, event) => total + event.usage.inputTokens, 0)
      usage.outputTokens = steps.reduce((total, event) => total + event.usage.outputTokens, 0)
      if (steps.every(event => count(event.usage?.cacheReadTokens) !== undefined)) usage.cachedTokens = steps.reduce((total, event) => total + event.usage.cacheReadTokens, 0)
    }
  } else {
    answer = events.filter(event => event.type === 'text' && event.part?.type === 'text').map(event => event.part.text || '').join('')
    const step = events.findLast(event => event.type === 'step_finish' || event.part?.type === 'step-finish')
    const raw = step?.part?.tokens || step?.tokens
    if (raw) { usage.inputTokens = count(raw.input); usage.outputTokens = count(raw.output); usage.cachedTokens = count(raw.cache?.read) }
  }
  // Text output is supported for older CLIs and user-defined WorkBuddy wrappers.
  if (!events.length) answer = output
  if (!answer.trim()) throw new BbgddgError('EMPTY_AGENT_RESPONSE', '工具没有返回完整的回答，请检查命令参数和登录状态。', 2)
  if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) usage.totalTokens = usage.inputTokens + usage.outputTokens
  return { answer: answer.trim(), usage }
}
