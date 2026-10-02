import { AiSettingsStore, type ApiId, type AiUsage, validateBaseUrl } from './ai-settings.js'
import { BbgddgError } from './types.js'
export interface AgentAnswer { answer: string; usage: AiUsage }
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
export class ApiAgent {
  constructor(private readonly settings: AiSettingsStore) {}
  private prepared(id: ApiId) {
    const profile = this.settings.profile(id), secret = this.settings.secret(profile)
    if (!secret || !profile.model || !profile.baseUrl) throw new BbgddgError('API_NOT_CONFIGURED', '请先在 AI 设置中填写接口地址、模型和 API 密钥。', 2)
    const base = validateBaseUrl(profile.baseUrl)
    const headers: Record<string, string> = profile.protocol === 'anthropic'
      ? { 'x-api-key': secret, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
      : { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }
    return { profile, secret, base, headers }
  }
  private async request(url: string, headers: Record<string, string>, body?: unknown, timeout = 120000): Promise<any> {
    let response: Response
    try { response = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout), redirect: 'error' }) }
    catch { throw new BbgddgError('API_CONNECTION_FAILED', '接口连接失败或超时，请检查地址和网络。', 2) }
    if (!response.ok) {
      // Never relay remote error bodies: some providers echo request headers or keys.
      const hint = response.status === 401 || response.status === 403 ? '密钥无效或没有权限' : response.status === 429 ? '请求受限或额度不足' : response.status === 404 ? '接口地址或模型不存在' : response.status === 400 ? '模型不支持该请求或参数不匹配' : '服务暂时不可用'
      throw new BbgddgError('API_REQUEST_FAILED', `${hint}（HTTP ${response.status}）。`, 2)
    }
    try { return await response.json() } catch { throw new BbgddgError('INVALID_API_RESPONSE', '接口没有返回有效的 JSON 数据。', 2) }
  }
  async invoke(id: ApiId, prompt: string, model?: string): Promise<AgentAnswer> {
    const { profile, base, headers } = this.prepared(id)
    const requestedModel = model || profile.model
    const isClaude = profile.protocol === 'anthropic'
    const response = await this.request(base + (isClaude ? '/messages' : '/chat/completions'), headers,
      isClaude ? { model: requestedModel, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }
      : { model: requestedModel, stream: false, messages: [{ role: 'user', content: prompt }] })
    const answer = isClaude ? response.content?.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n') : response.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) throw new BbgddgError('EMPTY_API_RESPONSE', '模型没有返回可显示的回答。', 2)
    const raw = response.usage || {}
    const input = count(isClaude ? raw.input_tokens : raw.prompt_tokens)
    const output = count(isClaude ? raw.output_tokens : raw.completion_tokens)
    const cacheRead = count(isClaude ? raw.cache_read_input_tokens : (raw.prompt_tokens_details?.cached_tokens ?? raw.prompt_cache_hit_tokens))
    const cacheWrite = count(isClaude ? raw.cache_creation_input_tokens : undefined)
    const billedInput = input === undefined ? undefined : input + (isClaude ? (cacheRead ?? 0) + (cacheWrite ?? 0) : 0)
    return { answer: answer.trim(), usage: {
      provider: id, model: response.model || requestedModel, inputTokens: billedInput, outputTokens: output,
      cachedTokens: cacheRead, totalTokens: count(raw.total_tokens) ?? (billedInput !== undefined && output !== undefined ? billedInput + output : undefined), recordedAt: new Date().toISOString(),
    } }
  }
  async test(id: ApiId) {
    const { base, headers } = this.prepared(id)
    const response = await this.request(base + '/models', headers, undefined, 15000)
    const models = Array.isArray(response.data) ? response.data.filter((model: any) => typeof model.id === 'string').map((model: any) => model.id) : []
    return { ok: true, models, message: '连接成功，已读取模型列表；未发起生成请求。' }
  }
  async balance(id: ApiId) {
    const { base, headers } = this.prepared(id)
    if (id !== 'api-deepseek' || new URL(base).hostname !== 'api.deepseek.com') return { available: false, message: '该服务没有统一的余额查询接口，请在服务商账户页面查看。' }
    const data = await this.request('https://api.deepseek.com/user/balance', headers, undefined, 15000)
    return { available: true, balances: data.balance_infos?.map((item: any) => ({ currency: item.currency, total: item.total_balance })), message: '服务商返回的账户余额；不代表 BBGDDG 的本次用量。' }
  }
}
