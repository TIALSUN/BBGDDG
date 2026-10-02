import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { BbgddgConfig } from './config.js'
import { BbgddgError } from './types.js'
import { getDesktopMasterKey } from './ai-secrets.js'

export const cliIds = ['codex', 'claude', 'workbuddy', 'deepseek-harness', 'opencode'] as const
export type CliId = typeof cliIds[number]
export const apiIds = ['api-deepseek', 'api-compatible', 'api-claude'] as const
export type ApiId = typeof apiIds[number]
export type ProviderId = CliId | ApiId
export interface ApiProfile { id: ApiId; label: string; protocol: 'openai' | 'anthropic'; baseUrl: string; model: string; encryptedKey?: string }
export interface CliProfile { command: string; args?: string[]; model: string }
export interface AiUsage {
  provider: string; model: string; inputTokens?: number; outputTokens?: number; cachedTokens?: number
  totalTokens?: number; costUsd?: number; costEstimated?: boolean; recordedAt: string
}
export interface UsageSummary { calls: number; reportedCalls: number; inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number; last?: AiUsage }
interface Settings { defaultProvider?: ProviderId; cli: Partial<Record<CliId, CliProfile>>; api: ApiProfile[] }
const defaults = (): Settings => ({ cli: {}, api: [
  { id: 'api-deepseek', label: 'DeepSeek API', protocol: 'openai', baseUrl: 'https://api.deepseek.com', model: '' },
  { id: 'api-compatible', label: '自定义兼容 API', protocol: 'openai', baseUrl: '', model: '' },
  { id: 'api-claude', label: 'Claude API', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: '' },
] })
export function validateBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (url.username || url.password || url.search || url.hash) throw new Error()
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error()
    return url.href.replace(/\/$/, '')
  } catch { throw new BbgddgError('INVALID_API_URL', '接口地址需要是 HTTPS 地址；本机服务可以使用 HTTP。请填写基础地址，不要包含密钥、查询参数或完整的聊天接口路径。', 2) }
}
export class AiSettingsStore {
  private readonly file: string
  private readonly usageFile: string
  constructor(private readonly config: BbgddgConfig) {
    this.file = path.join(config.dataDir, 'ai-settings.json')
    this.usageFile = path.join(config.dataDir, 'ai-usage.json')
  }
  private read(): Settings {
    if (!fs.existsSync(this.file)) return defaults()
    const saved = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Settings
    return { ...defaults(), ...saved, api: defaults().api.map(profile => saved.api?.find(p => p.id === profile.id) ?? profile) }
  }
  private write(value: Settings) {
    fs.mkdirSync(this.config.dataDir, { recursive: true })
    const temp = this.file + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
    fs.renameSync(temp, this.file)
  }
  private encryptionKey(): Buffer {
    const desktopKey = getDesktopMasterKey()
    if (desktopKey) return desktopKey
    const file = path.join(this.config.dataDir, '.ai-secret-key')
    if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32), { mode: 0o600, flag: 'wx' })
    return fs.readFileSync(file)
  }
  private encrypt(secret: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv)
    const bytes = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64')
  }
  secret(profile: ApiProfile): string {
    if (!profile.encryptedKey) return ''
    try {
      const bytes = Buffer.from(profile.encryptedKey, 'base64')
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), bytes.subarray(0, 12))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    } catch { throw new BbgddgError('KEY_UNAVAILABLE', '无法读取已保存的密钥，请在 AI 设置中重新输入并保存。', 2) }
  }
  profile(id: ApiId) { return this.read().api.find(profile => profile.id === id)! }
  cli(id: CliId) { return this.read().cli[id] }
  defaultProvider() { return this.read().defaultProvider }
  publicSettings() {
    const value = this.read()
    return { defaultProvider: value.defaultProvider, cli: value.cli, api: value.api.map(({ encryptedKey, ...profile }) => ({ ...profile, hasKey: !!encryptedKey })) }
  }
  saveApi(id: string, input: unknown) {
    if (!apiIds.includes(id as ApiId)) throw new BbgddgError('UNKNOWN_PROVIDER', '找不到这个 API 服务。', 2)
    const body = z.object({ baseUrl: z.string().min(1).max(1000), model: z.string().trim().min(1).max(160), apiKey: z.string().trim().max(4096).optional(), clearKey: z.boolean().optional() }).parse(input)
    const value = this.read(), profile = value.api.find(profile => profile.id === id)!
    profile.baseUrl = validateBaseUrl(body.baseUrl); profile.model = body.model
    if (body.clearKey) delete profile.encryptedKey
    else if (body.apiKey) profile.encryptedKey = this.encrypt(body.apiKey)
    this.write(value)
    return this.publicSettings()
  }
  saveCli(id: string, input: unknown) {
    if (!cliIds.includes(id as CliId)) throw new BbgddgError('UNKNOWN_PROVIDER', '找不到这个命令行工具。', 2)
    const body = z.object({ command: z.string().trim().max(2000), args: z.array(z.string().max(1000)).max(30).optional(), model: z.string().trim().max(160).default('') }).parse(input)
    if (body.command.includes('\n') || body.command.includes('\r')) throw new BbgddgError('INVALID_COMMAND', '请填写单个可执行文件路径或命令名称。', 2)
    const value = this.read(); value.cli[id as CliId] = body; this.write(value)
    return this.publicSettings()
  }
  select(id: string) {
    if (![...cliIds, ...apiIds].includes(id as ProviderId)) throw new BbgddgError('UNKNOWN_PROVIDER', '找不到这个 AI 服务。', 2)
    const value = this.read(); value.defaultProvider = id as ProviderId; this.write(value)
  }
  private summaries(): Record<string, UsageSummary> {
    return fs.existsSync(this.usageFile) ? JSON.parse(fs.readFileSync(this.usageFile, 'utf8')) : {}
  }
  usage(id: string): UsageSummary { return this.summaries()[id] ?? { calls: 0, reportedCalls: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 } }
  record(usage: AiUsage) {
    fs.mkdirSync(this.config.dataDir, { recursive: true })
    const summaries = this.summaries(), previous = this.usage(usage.provider)
    const reported = usage.inputTokens !== undefined && usage.outputTokens !== undefined
    summaries[usage.provider] = {
      calls: previous.calls + 1, reportedCalls: previous.reportedCalls + Number(reported),
      inputTokens: previous.inputTokens + (usage.inputTokens ?? 0), outputTokens: previous.outputTokens + (usage.outputTokens ?? 0),
      cachedTokens: previous.cachedTokens + (usage.cachedTokens ?? 0), totalTokens: previous.totalTokens + (usage.totalTokens ?? (reported ? usage.inputTokens! + usage.outputTokens! : 0)), last: usage,
    }
    const temp = this.usageFile + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(summaries, null, 2), { mode: 0o600 }); fs.renameSync(temp, this.usageFile)
  }
}
