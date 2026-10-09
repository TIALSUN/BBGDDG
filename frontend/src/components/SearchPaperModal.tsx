/**
 * SearchPaperModal.tsx — Add a source by URL or by searching S2 + arXiv.
 */
import { useState, useRef, type KeyboardEvent } from 'react'
import { sourcesApi, searchApi, type Source, type SearchResult } from '../lib/api'

interface Props {
  projectId: string
  onClose: () => void
  onAdded: (s: Source) => void
}

type Tab = 'url' | 'search' | 'local'

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16,
  padding: 24, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f0f0f', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', color: '#e5e7eb', fontSize: 13,
  fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}

function ResultCard({
  paper, projectId, existingUrls, onAdded,
}: {
  paper: SearchResult
  projectId: string
  existingUrls: Set<string>
  onAdded: (url: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [err, setErr] = useState('')

  const targetUrl = paper.arxiv_url || paper.pdf_url
  const hasPdf = !!(paper.pdf_url || paper.arxiv_url)
  const isAlreadyAdded = targetUrl ? existingUrls.has(targetUrl) : false

  const handleAdd = async () => {
    if (!targetUrl) return
    setAdding(true); setErr('')
    try {
      await sourcesApi.addUrl(projectId, targetUrl)
      setAdded(true)
      onAdded(targetUrl)
    } catch (e: any) {
      setErr(e.message?.slice(0, 80) || "失败")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{
      background: '#151515', border: '1px solid var(--border)', borderRadius: 10,
      padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5,
      opacity: hasPdf ? 1 : 0.5,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', lineHeight: 1.4 }}>
        {paper.title}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {paper.authors && (
          <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {paper.authors}
          </span>
        )}
        {paper.year && <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{paper.year}</span>}
        {paper.venue && <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>· {paper.venue}</span>}
        {paper.citation_count != null && (
          <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>· {paper.citation_count} citations</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
        {paper.arxiv_url
          ? <span style={{ background: '#1e1b4b', border: '1px solid #312e81', color: '#818cf8', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>arXiv</span>
          : paper.pdf_url
            ? <span style={{ background: '#14532d', border: '1px solid #166534', color: '#4ade80', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>PDF</span>
            : <span style={{ background: '#1c1917', border: '1px solid #44403c', color: 'var(--muted)', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>无 PDF</span>
        }
        <div style={{ flex: 1 }} />
        {paper.arxiv_url && (
          <a href={paper.arxiv_url} target="_blank" rel="noreferrer"
            style={{ color: 'var(--muted)', fontSize: 10, textDecoration: 'none' }}>🔗</a>
        )}
        {(isAlreadyAdded || added) ? (
          <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>✓ 已添加</span>
        ) : hasPdf ? (
          <button
            onClick={handleAdd}
            disabled={adding}
            style={{
              background: adding ? '#2a2a2a' : 'var(--accent)',
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '4px 12px', fontSize: 11, fontWeight: 600,
              cursor: adding ? 'not-allowed' : 'pointer',
            }}
          >
            {adding ? <><span className="spinner" style={{ width: 8, height: 8, marginRight: 4 }} />正在添加…</> : "＋ 添加"}
          </button>
        ) : null}
      </div>
      {err && <div style={{ fontSize: 10, color: '#f87171' }}>⚠ {err}</div>}
    </div>
  )
}

export default function SearchPaperModal({ projectId, onClose, onAdded }: Props) {
  const [tab, setTab] = useState<Tab>('search')
  // URL tab
  const [url, setUrl] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')
  // Search tab
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searchError, setSearchError] = useState('')
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleUpload = async () => {
    if (!localFile || uploading) return
    if (localFile.size > 25 * 1024 * 1024) { setUploadError('文件不能超过 25 MB。'); return }
    setUploading(true); setUploadError('')
    try { onAdded(await sourcesApi.upload(projectId, localFile)) }
    catch (error: unknown) { setUploadError(error instanceof Error ? error.message : '导入失败，请重试。') }
    finally { setUploading(false) }
  }

  const handleAddUrl = async () => {
    if (!url.trim()) return
    setUrlLoading(true); setUrlError('')
    try {
      const result = await sourcesApi.addUrl(projectId, url.trim())
      onAdded({
        id: result.id, project_id: projectId, type: 'pdf',
        url: result.url, title: result.title, pages: result.pages,
        last_page_read: result.last_page_read ?? 1,
        created_at: new Date().toISOString(), accessed_at: new Date().toISOString(),
      })
    } catch (e: any) {
      setUrlError(e.message)
    } finally {
      setUrlLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!query.trim() || query.trim().length < 3) return
    setSearching(true); setSearchError(''); setResults(null)
    try {
      const data = await searchApi.papers(query.trim())
      setResults(data.results)
      if (!data.results.length) setSearchError(data.error || "没有找到结果")
    } catch (e: any) {
      setSearchError(e.message)
    } finally {
      setSearching(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        flex: 1, background: 'none', border: 'none',
        borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
        color: tab === t ? '#e5e7eb' : '#6b7280',
        fontSize: 13, fontWeight: tab === t ? 600 : 400,
        padding: '8px 0', cursor: 'pointer',
      }}
    >{label}</button>
  )

  return (
    <div style={overlayStyle} onClick={() => { if (!uploading) onClose() }}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#fff', margin: '0 0 4px', fontSize: 15 }}>添加文献</h3>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
            选择本地文档、搜索论文或直接粘贴链接。
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16, flexShrink: 0 }}>
          {tabBtn('search', "🔍 搜索论文")}
          {tabBtn('url', "🔗 粘贴链接")}
          {tabBtn('local', '📄 本地文档')}
        </div>

        {tab === 'local' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input ref={fileRef} type="file" accept=".pdf,.md,.txt,.docx" aria-label="选择本地文档" style={{ display: 'none' }} disabled={uploading}
              onChange={event => { setLocalFile(event.target.files?.[0] ?? null); setUploadError('') }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ background: 'var(--bg)', border: '2px dashed var(--border)', borderRadius: 10, padding: 28, color: '#e5e7eb', cursor: uploading ? 'wait' : 'pointer' }}>
              📂 选择本地文档 文件
            </button>
            {localFile && <div style={{ color: '#d1d5db', fontSize: 13, overflowWrap: 'anywhere' }}>{localFile.name} · {(localFile.size / 1024 / 1024).toFixed(2)} MB</div>}
            <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>支持单个 PDF，最大 25 MB。导入后可在此项目中阅读和提问。</p>
            {uploadError && <div role="alert" style={{ color: '#f87171', fontSize: 12 }}>{uploadError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={uploading} style={{ background: 'none', border: '1px solid var(--border)', color: '#9ca3af', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>取消</button>
              <button onClick={handleUpload} disabled={!localFile || uploading} style={{ background: !localFile || uploading ? '#3a3a3a' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: !localFile || uploading ? 'not-allowed' : 'pointer' }}>
                {uploading ? '正在导入…' : '导入文档'}
              </button>
            </div>
          </div>
        )}

        {/* Search tab */}
        {tab === 'search' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}>
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="例如：Attention Is All You Need"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={handleSearch}
                disabled={searching || query.trim().length < 3}
                style={{
                  background: searching || query.trim().length < 3 ? '#2a2a2a' : 'var(--accent)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '0 16px', fontSize: 13, fontWeight: 600,
                  cursor: searching ? 'not-allowed' : 'pointer', flexShrink: 0,
                }}
              >
                {searching ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "搜索"}
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searching && (
                <div style={{ textAlign: 'center', paddingTop: 30, color: 'var(--muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontSize: 12 }}>正在搜索 Semantic Scholar 和 arXiv…</div>
                </div>
              )}
              {!searching && searchError && (
                <div style={{ textAlign: 'center', paddingTop: 30, color: 'var(--muted)', fontSize: 13 }}>
                  {searchError}
                </div>
              )}
              {!searching && results && results.map((r, i) => (
                <ResultCard
                  key={r.s2_paper_id || i}
                  paper={r}
                  projectId={projectId}
                  existingUrls={addedUrls}
                  onAdded={url => setAddedUrls(prev => new Set([...prev, url]))}
                />
              ))}
              {!searching && results === null && !searchError && (
                <div style={{ textAlign: 'center', paddingTop: 30, color: 'var(--muted)', fontSize: 13 }}>
                  输入论文标题，按 Enter 或点击搜索
                </div>
              )}
            </div>
          </>
        )}

        {/* URL tab */}
        {tab === 'url' && (
          <>
            <input
              autoFocus
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
              placeholder="https://arxiv.org/abs/1234.56789"
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <p style={{ color: 'var(--muted)', fontSize: 11, margin: '0 0 16px' }}>
              支持 arXiv、OpenReview、ACL Anthology、PMLR、DOI 链接及直接指向 PDF 的链接。
            </p>
            {urlError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>⚠️ {urlError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: '#9ca3af', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                取消
              </button>
              <button
                onClick={handleAddUrl}
                disabled={urlLoading || !url.trim()}
                style={{
                  background: urlLoading || !url.trim() ? '#3a3a3a' : 'var(--accent)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  cursor: urlLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {urlLoading ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />正在获取…</> : "添加文献"}
              </button>
            </div>
          </>
        )}

        {/* Close button for search tab */}
        {tab === 'search' && (
          <div style={{ marginTop: 12, flexShrink: 0, textAlign: 'right' }}>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: '#9ca3af', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
