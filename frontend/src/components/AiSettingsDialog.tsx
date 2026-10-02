import { useEffect, useRef, useState } from 'react'
import { aiApi, type AiSettings } from '../lib/api'
import { notifyAiChange } from '../hooks/useAgent'
const cliOptions = [{ id: 'codex', label: 'Codex' }, { id: 'claude', label: 'Claude Code' }, { id: 'workbuddy', label: '腾讯 WorkBuddy' }, { id: 'deepseek-harness', label: 'DeepSeek Harness' }, { id: 'opencode', label: 'OpenCode' }]
export default function AiSettingsDialog({ onClose, initialProvider }: { onClose: () => void; initialProvider?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [settings, setSettings] = useState<AiSettings | null>(null), [provider, setProvider] = useState(initialProvider || 'api-deepseek')
  const [baseUrl, setBaseUrl] = useState(''), [model, setModel] = useState(''), [key, setKey] = useState(''), [command, setCommand] = useState(''), [args, setArgs] = useState('[]')
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [models, setModels] = useState<string[]>([])
  useEffect(() => { dialog.current?.showModal(); aiApi.settings().then(setSettings).catch(error => setError(error.message)) }, [])
  useEffect(() => {
    if (!settings) return
    const api = settings.api.find(item => item.id === provider), cli = settings.cli[provider]
    setBaseUrl(api?.baseUrl || ''); setModel(api?.model || cli?.model || ''); setCommand(cli?.command || ''); setArgs(JSON.stringify(cli?.args || [])); setKey('')
  }, [provider, settings])
  const isApi = provider.startsWith('api-'), savedApi = settings?.api.find(item => item.id === provider)
  async function save() {
    if (isApi) return aiApi.saveApi(provider, { baseUrl, model, ...(key ? { apiKey: key } : {}) })
    let parsed: unknown
    try { parsed = JSON.parse(args) } catch { throw new Error('调用参数需要是 JSON 字符串数组。') }
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error('调用参数需要是 JSON 字符串数组。')
    return aiApi.saveCli(provider, { command, model: provider === 'deepseek-harness' ? '' : model, args: parsed })
  }
  async function action(kind: 'save' | 'test' | 'balance' | 'clear') {
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = kind === 'clear' ? await aiApi.saveApi(provider, { baseUrl, model, clearKey: true }) : await save()
      setSettings(saved); setKey(''); notifyAiChange()
      if (kind === 'test') { const result = await aiApi.test(provider); setModels(result.models); setMessage(result.message) }
      else if (kind === 'balance') { const result = await aiApi.balance(provider); setMessage(result.balances?.map(item => `${item.currency} 余额 ${item.total}`).join('；') || result.message) }
      else setMessage(kind === 'clear' ? '已删除保存的密钥。' : '设置已保存。')
    } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="ai-settings-dialog" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose() }}>
    <div className="ai-dialog-header"><div><h2>AI 服务设置</h2><p>命令行使用工具自己的登录；API 使用你填写的密钥。</p></div><button className="text-button" aria-label="关闭 AI 设置" onClick={onClose}>×</button></div>
    <div className="ai-dialog-body"><nav className="ai-settings-nav" aria-label="AI 服务设置分类"><small>命令行工具</small>{cliOptions.map(item => <button disabled={busy} key={item.id} className={provider === item.id ? 'active' : ''} onClick={() => { setProvider(item.id); setError(''); setMessage(''); setModels([]) }}>{item.label}</button>)}<small>API 服务</small>{settings?.api.map(item => <button disabled={busy} key={item.id} className={provider === item.id ? 'active' : ''} onClick={() => { setProvider(item.id); setError(''); setMessage(''); setModels([]) }}>{item.label}{item.hasKey && <span>已配置密钥</span>}</button>)}</nav>
    <form className="ai-settings-form" onSubmit={event => { event.preventDefault(); void action('save') }}>
      {!settings ? <p>正在读取设置…</p> : <>
      <h3>{savedApi?.label || cliOptions.find(item => item.id === provider)?.label}</h3>
      {isApi ? <><label>接口基础地址<input name="apiBaseUrl" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://服务地址/v1" required autoComplete="off" /></label><label>模型名称<input name="apiModel" list="ai-model-options" value={model} onChange={event => setModel(event.target.value)} placeholder="填写服务商提供的模型名称" required autoComplete="off" /></label><datalist id="ai-model-options">{models.map(name => <option key={name} value={name}/>)}</datalist><label>API 密钥<input name="apiKey" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={savedApi?.hasKey ? '密钥已保存，留空保留；输入新密钥可替换' : '仅在这里输入密钥'} autoComplete="off" /></label><p className="ai-form-hint">密钥在本机加密保存，页面不会回显。连接测试只读取模型列表；发送问题时才生成回答并产生用量。</p><p className="ai-form-hint">API 调用使用服务商的 API 账单，与命令行工具的订阅额度分别计算。</p></>
      : <><label>命令名称或路径<input name="cliCommand" value={command} onChange={event => setCommand(event.target.value)} placeholder={provider === 'deepseek-harness' ? 'dsh 或完整的入口文件路径' : provider === 'claude' ? 'claude 或完整的入口文件路径' : '留空自动查找，或填写完整路径'} autoComplete="off" /></label>{provider !== 'deepseek-harness' && <label>模型名称（可选）<input name="cliModel" value={model} onChange={event => setModel(event.target.value)} placeholder="留空使用工具默认模型" autoComplete="off" /></label>}{provider === 'workbuddy' && <><label>非交互调用参数（JSON 数组）<textarea name="cliArgs" value={args} onChange={event => setArgs(event.target.value)} rows={3}/></label><p className="ai-form-hint">WorkBuddy 的公开文档暂未提供可确认的问答命令。请只填写你已验证的官方命令或适配器入口及参数；问题通过标准输入传入。</p></>}{provider === 'deepseek-harness' && <p className="ai-form-hint">使用官方 dsh 的 headless 模式。模型和认证由 Harness 自己的配置管理。</p>}<p className="ai-form-hint">检测到命令只代表已经安装，首次调用前请在工具中完成登录。此处不导入或复制工具的账号凭据。</p></>}
      {error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="ai-settings-success">{message}</p>}
      <div className="ai-settings-actions"><button type="submit" className="primary" disabled={busy}>保存设置</button>{isApi && <button type="button" className="secondary" disabled={busy} onClick={() => void action('test')}>保存并测试连接</button>}{provider === 'api-deepseek' && <button type="button" className="secondary" disabled={busy} onClick={() => void action('balance')}>查询余额</button>}</div>{isApi && savedApi?.hasKey && <button type="button" className="danger-text" disabled={busy} onClick={() => { if (confirm('删除这项服务保存的 API 密钥吗？')) void action('clear') }}>删除保存的密钥</button>}
      </>}
    </form></div>
  </dialog>
}
