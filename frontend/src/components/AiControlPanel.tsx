import { useState } from 'react'
import { useAgent } from '../hooks/useAgent'
import AgentSelect from './AgentSelect'
import AiSettingsDialog from './AiSettingsDialog'
import { formatTokens } from './AiUsageView'
export default function AiControlPanel({ compact = false, minimized = false }: { compact?: boolean; minimized?: boolean }) {
  const { agent, setAgent, agents, current, loading, error, refresh } = useAgent()
  const [settings, setSettings] = useState<string | null>(null), [expanded, setExpanded] = useState(!compact)
  return <section className={`ai-console ${compact ? 'is-compact' : ''} ${minimized ? 'is-minimized' : ''}`} aria-label="AI 服务选择与用量">
    <header className="ai-console-header"><div><h2>{compact ? '阅读助手' : '研究助手'}</h2><p>{compact ? current?.label || '选择问答工具' : '选择本次研究使用的 AI，文献库与手动笔记始终在本机。'}</p></div><div className="ai-console-actions">{compact && <AgentSelect agent={agent} setAgent={setAgent} agents={agents}/>}<button className="secondary" onClick={() => setSettings(current?.id || 'api-deepseek')}>AI 设置</button>{!minimized && <button className="text-button" onClick={() => { void refresh() }} aria-label="重新检测 AI 工具">重新检测</button>}{compact && !minimized && <button className="text-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '全部服务'}</button>}</div></header>
    {error && <p className="error-message" role="alert">{error}</p>}{loading && <p className="ai-form-hint">正在检测本机工具…</p>}
    {expanded && !minimized && <div className="ai-provider-grid">{agents.map(item => <button type="button" key={item.id} data-ai-provider={item.id} className={`ai-provider ${item.available ? 'is-available' : 'is-unavailable'} ${agent === item.id ? 'is-selected' : ''}`} aria-pressed={agent === item.id} onClick={() => { if (item.available) void setAgent(item.id); else setSettings(item.id) }} title={item.status}>
      <div className="ai-provider-title"><strong>{item.label}</strong><span>{item.available ? '可选择' : item.installed ? '已安装 · 待设置' : item.kind === 'api' ? '待配置' : '未检测到'}</span></div><p className="ai-provider-model">{item.usage.last?.model || item.model}</p><div className="ai-provider-usage">{item.usage.reportedCalls ? <>累计 {formatTokens(item.usage.totalTokens)} tokens <small>{item.usage.reportedCalls}/{item.usage.calls} 次成功问答回传用量</small></> : <>{item.usage.calls ? '已调用，工具未回传用量' : '尚无本软件调用记录'}</>}</div><small>{item.available ? item.quota : item.status}</small>
    </button>)}</div>}
    {!expanded && current && !minimized && <div className="ai-current-usage"><span>模型：{current.usage.last?.model || current.model}</span><span>{current.usage.reportedCalls ? `本软件累计 ${formatTokens(current.usage.totalTokens)} tokens` : '本软件尚无可读取用量'}</span><small>{current.quota}</small></div>}
    {!compact && <p className="ai-console-footnote">亮色项已就绪，淡色项点击可设置。用量仅统计本软件的成功调用，不等于账号总用量或剩余额度。</p>}
    {settings && <AiSettingsDialog initialProvider={settings} onClose={() => setSettings(null)}/>}
  </section>
}
