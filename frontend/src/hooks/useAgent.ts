import { useState, useEffect, useCallback } from 'react'
import { aiApi, type AgentInfo } from '../lib/api'
export type { AgentInfo } from '../lib/api'
export const notifyAiChange = () => window.dispatchEvent(new Event('pdfpal-ai-change'))

/**
 * Loads the server's agent list (GET /api/agents) and the user's persisted
 * selection. The chosen agent is stored by the local server so it survives across
 * the per-source and project-chat panels. Falls back to the server default
 * when the stored choice is no longer available.
 */
export function useAgent() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [agent, setAgent] = useState<string>('')
  const [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const data = await aiApi.agents(); setAgents(data.agents)
      const available = data.agents.filter(item => item.available)
      setAgent(available.find(item => item.id === data.default)?.id || available[0]?.id || ''); setError('')
    } catch (error) { setError(error instanceof Error ? error.message : '无法读取 AI 工具状态。') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh(); const listener = () => { void refresh() }
    window.addEventListener('pdfpal-ai-change', listener)
    return () => window.removeEventListener('pdfpal-ai-change', listener)
  }, [refresh])
  const selectAgent = async (id: string) => {
    if (!agents.find(item => item.id === id)?.available) return
    try { await aiApi.select(id); setAgent(id); notifyAiChange() }
    catch (error) { setError(error instanceof Error ? error.message : '切换失败。') }
  }
  return { agent, setAgent: selectAgent, agents, refresh, error, loading, current: agents.find(item => item.id === agent) }
}
