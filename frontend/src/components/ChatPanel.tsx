import {useChatTask,updateChat,chatRevision,sendChat,stopChat} from '../lib/chatTasks'
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import ChatMemoryPanel from './ChatMemoryPanel'
import ChatAnswer from './ChatAnswer'
import { chatApi } from '../lib/api'
import { useAgent } from '../hooks/useAgent'
import AiUsageView from './AiUsageView'
import type { ChatReference, ContextScope, AiUsage, NoteAnchor } from '../lib/api'
import AgentSelect from './AgentSelect'

interface Message {
  anchors?:NoteAnchor[]
  references?: ChatReference[]
  contextScope?: ContextScope
  usage?: AiUsage
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  pdfText: string
  pdfUrl: string
  disabled: boolean
  selectedText?: string
  onSelectedTextUsed?: () => void
  // v2
  projectId?: string | null
  sourceId?: string | null
  // v1 legacy
  selectedAnchors?:NoteAnchor[]
  onExtract?:(content:string,anchors:NoteAnchor[])=>void
  onReference?: (reference:ChatReference)=>void
  sessionId?: string | null
  initialMessages?: { role: string; content: string }[]
}

export default function ChatPanel({ pdfText, pdfUrl, disabled, selectedText, onSelectedTextUsed, projectId, sourceId, sessionId, initialMessages, onReference,selectedAnchors,onExtract }: Props) {
  // Retained in the component contract for older callers; context is now
  // loaded by the server-side ChatService from source IDs.
  void pdfText
  void pdfUrl
  const taskKey=JSON.stringify([projectId,sourceId||sessionId||'project'])
  const {messages,loading,error,revision}=useChatTask(taskKey)
  const setMessages=(messages:Message[])=>updateChat(taskKey,{messages})
  const setError=(error:string)=>updateChat(taskKey,{error})
  const draftKey=`bbgddg:question:${projectId}:${sourceId||'project'}`
  const [input, setInput] = useState(()=>sessionStorage.getItem(draftKey)||'')
  useEffect(()=>{sessionStorage.setItem(draftKey,input)},[input,draftKey])
  const [scope,setScope]=useState<ContextScope>('document')
  const [selection,setSelection]=useState('')
  const [memoryRefresh,setMemoryRefresh]=useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { agent, setAgent, agents: agentOptions } = useAgent()

  // Load chat history when source changes
  useEffect(() => {
    let cancelled=false
    setSelection('');setScope('document')
    const initialRevision=chatRevision(taskKey)
    if(loading||messages.length)return
    if(initialMessages?.length)setMessages(initialMessages.map(m=>({...m,role:m.role as 'user'|'assistant'})))
    if (projectId && sourceId) {
      fetch(`/api/projects/${projectId}/sources/${sourceId}/chat`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : { messages: [] })
        .then(data => {
          if (!cancelled&&chatRevision(taskKey)===initialRevision&&data.messages?.length > 0) {
            setMessages(data.messages.map((m: { role: string; content: string; usage?: AiUsage;references?:ChatReference[];contextScope?:ContextScope }) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content, usage: m.usage,references:m.references,contextScope:m.contextScope
            })))
          }
        })
        .catch(() => {})
    }
    return()=>{cancelled=true}
  }, [projectId, sourceId, sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])
  useEffect(()=>{if(!loading)setMemoryRefresh(v=>v+1)},[loading,revision])

  // When selectedText changes, pre-fill the textarea with a quote prompt
  useEffect(() => {
    if (!selectedText || disabled) return
    setSelection(selectedText);setScope('selection')
    const quoted = `> "${selectedText}"\n\n`
    setInput(quoted)
    textareaRef.current?.focus()
    // Move cursor to end
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.value.length
        textareaRef.current.selectionEnd = textareaRef.current.value.length
      }
    }, 10)
  }, [selectedText, disabled])

  const send = async () => {
    if (!agent || !input.trim() || loading || disabled || (scope==='selection'&&!selection)) return
    const userMsg = input.trim()
    setInput('')
    setError('')
    onSelectedTextUsed?.()

    const newHistory: Message[] = [...messages, { role: 'user', content: userMsg }]
    const success=await sendChat(taskKey, {message:userMsg,agent,project_id:projectId??null,source_id:sourceId??null,context_scope:scope,selected_text:scope==='selection'?selection:undefined},newHistory,scope==='selection'?selectedAnchors||[]:[])
    if(!success){sessionStorage.setItem(draftKey,userMsg);setInput(userMsg)}
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height:'100%', minHeight:0, overflow: 'hidden', background: 'var(--panel)' }}>
      {/* Chat header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>AI 对话</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {messages.length > 0 && (
            <button
              onClick={async () => {
                try {if(projectId&&sourceId)await chatApi.clearSourceChat(projectId,sourceId);setMessages([]);setError('');setMemoryRefresh(v=>v+1)}catch(e){setError(e instanceof Error?e.message:'清空失败。')}
              }}
              disabled={loading} title="清空对话及记忆"
              style={{
                background: 'none', border: 'none', color: 'var(--muted)',
                cursor: 'pointer', fontSize: 12, padding: '3px 8px',
                borderRadius: 5, transition: 'color 0.15s',
              }}
            >
              清空
            </button>
          )}
          <AgentSelect agent={agent} setAgent={setAgent} agents={agentOptions} />
        </div>
      </div>

      <div className="chat-scope"><label>问答范围<select aria-label="问答范围" disabled={loading} value={scope} onChange={e=>setScope(e.target.value as ContextScope)}><option value="selection" disabled={!selection}>选中文字</option><option value="document">当前 PDF</option><option value="project">项目文献</option></select></label><small>{scope==='selection'?'仅提供选中文字':scope==='document'?'提供当前文档的片段与全文':'提供当前项目中的文献'}</small></div>
      {scope==='selection'&&selection&&<details className="selection-preview"><summary>选中文字 · {selection.length} 字</summary><p>{selection}</p><button type="button" className="text-button" disabled={loading} onClick={()=>{setSelection('');setScope('document');onSelectedTextUsed?.()}}>取消选文</button></details>}
      <ChatMemoryPanel projectId={projectId} sourceId={sourceId} refresh={memoryRefresh} disabled={loading}/>
      {/* Selection hint banner */}
      <div className="quick-questions">{['解释这段','解释概念','逐步讲解推导'].map(question=><button className="secondary" key={question} disabled={loading||disabled} onClick={()=>setInput((selection?`> ${selection}\n\n`:'')+question)}>{question}</button>)}</div>
      {selectedText && !disabled && (
        <div style={{
          padding: '8px 14px',
          background: '#1e1e2e',
          borderBottom: '1px solid #2a2a4a',
          fontSize: 12,
          color: '#818cf8',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <span>✏️</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            已选中文字，可编辑下方问题或按 Enter 发送
          </span>
          <button
            onClick={() => { onSelectedTextUsed?.(); setInput('');setSelection('');setScope('document') }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}
          >✕</button>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.length === 0 && !loading && (
          <div style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
            {disabled
              ? "加载 PDF 后即可开始对话"
              : "可以提问文档中的任何内容…"}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'var(--accent)' : '#252525',
              color: msg.role === 'user' ? '#fff' : 'var(--text)',
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
            }}>
              {msg.role === 'assistant' ? (
                <div><ChatAnswer content={msg.content} references={msg.references} contextScope={msg.contextScope} projectId={projectId} onReference={onReference}/><AiUsageView usage={msg.usage}/>{onExtract&&<button className="secondary" onClick={e=>{const container=e.currentTarget.parentElement?.querySelector('.chat-answer');const selection=window.getSelection();const selected=selection&&!selection.isCollapsed&&container?.contains(selection.anchorNode)&&container.contains(selection.focusNode)?selection.toString():'';onExtract(selected||msg.content,msg.anchors||[])}}>摘入笔记</button>}</div>
              ) : msg.content}
            </div>
          </div>
        ))}

        {loading && <button className="secondary" onClick={()=>stopChat(taskKey)}>停止生成</button>}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '12px 16px', background: '#252525',
              borderRadius: '16px 16px 16px 4px',
              display: 'flex', alignItems: 'center', gap: 8,
              color: 'var(--muted)', fontSize: 14,
            }}>
              <span className="spinner" /> 正在思考…
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#2d1515', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!agent || disabled || loading}
          placeholder={!agent ? "请在 AI 设置中配置一个服务…" : disabled ? "请先加载 PDF…" : "输入问题…（Enter 发送，Shift+Enter 换行）"}
          rows={3}
          style={{
            flex: 1,
            background: '#0f0f0f',
            border: `1px solid ${selectedText && !disabled ? '#4f46e5' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '10px 14px',
            color: 'var(--text)',
            fontSize: 14,
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            opacity: disabled ? 0.5 : 1,
            transition: 'border-color 0.2s',
          }}
        />
        <button
          onClick={send}
          aria-label="发送问题" disabled={!agent || disabled || loading || !input.trim() || (scope==='selection'&&!selection)}
          style={{
            background: disabled || !input.trim() ? '#2a2a2a' : 'var(--accent)',
            color: disabled || !input.trim() ? '#6b7280' : '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '0 16px',
            fontSize: 18,
            cursor: disabled || loading || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            alignSelf: 'stretch',
          }}
        >
          {loading ? <span className="spinner" /> : '↑'}
        </button>
      </div>
    </div>
  )
}
