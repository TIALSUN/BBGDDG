import type { AiUsage } from '../lib/api'
export const formatTokens = (value: number) => value.toLocaleString('zh-CN')
export default function AiUsageView({ usage }: { usage?: AiUsage }) {
  if (!usage) return null
  return <div className="ai-message-usage" aria-label="此回答的模型与用量"><span>{usage.model}</span>{usage.inputTokens !== undefined && usage.outputTokens !== undefined ? <span>输入 {formatTokens(usage.inputTokens)} · 输出 {formatTokens(usage.outputTokens)} tokens{usage.cachedTokens !== undefined ? ` · 缓存命中 ${formatTokens(usage.cachedTokens)}` : ''}</span> : <span>工具未回传 token 用量</span>}{usage.costUsd !== undefined && <span>工具估算 ${usage.costUsd.toFixed(4)}，以账单为准</span>}</div>
}
