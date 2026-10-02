import type { AgentInfo } from '../lib/api'

interface Props {
  agent: string
  setAgent: (id: string) => void
  agents: AgentInfo[]
}

/** Compact agent selector styled to match the Web ON/OFF toggle next to it. */
export default function AgentSelect({ agent, setAgent, agents }: Props) {
  if (agents.length === 0) return null
  return (
    <select className="agent-select"
      value={agent}
      onChange={e => setAgent(e.target.value)}
      title="对话助手"
      aria-label="选择 AI 服务"
      style={{
        background: '#1a1a1a',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 12,
        color: '#a5b4fc',
        cursor: 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
      }}
    >
      {!agent && <option value="">暂无可用 AI</option>}
      {agents.map(a => (
        <option key={a.id} value={a.id} disabled={!a.available}>
          {a.label}{a.available ? '' : ' · 未就绪'}
        </option>
      ))}
    </select>
  )
}
