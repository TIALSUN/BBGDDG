import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi, type Project } from '../lib/api'
import { timeAgo } from '../lib/time'

interface NewProjectModalProps {
  onClose: () => void
  onCreate: (project: Project) => void
}

export function NewProjectModal({ onClose, onCreate }: NewProjectModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!title.trim()) { setError("请输入项目名称"); return }
    setLoading(true)
    setError('')
    try {
      const project = await projectsApi.create(title.trim(), description.trim())
      onCreate(project)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ color: '#fff', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>创建新项目</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 20px' }}>
          项目是你的研究工作区，可以添加 PDF、对话和记录笔记。
        </p>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>项目名称</div>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="例如：大语言模型缩放定律"
          style={{
            width: '100%', background: '#0f0f0f', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', color: '#e5e7eb', fontSize: 13,
            marginBottom: 14, fontFamily: 'inherit', boxSizing: 'border-box',
            outline: 'none',
          }}
        />

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>描述（可选）</div>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="你正在研究什么？"
          style={{
            width: '100%', background: '#0f0f0f', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', color: '#e5e7eb', fontSize: 13,
            marginBottom: 20, fontFamily: 'inherit', boxSizing: 'border-box',
            outline: 'none',
          }}
        />

        {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: '#9ca3af', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !title.trim()}
            style={{
              background: loading || !title.trim() ? '#3a3a3a' : 'var(--accent)',
              color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
              fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? "正在创建…" : "创建项目"}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--panel)',
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12, padding: 20, cursor: 'pointer',
        transition: 'border-color 0.15s', position: 'relative',
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 12 }}>📂</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{project.title}</div>
      {project.description && (
        <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 16, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {project.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {project.source_count > 0 && <span style={pillStyle}><b>{project.source_count}</b> 篇文献</span>}
        {project.note_count > 0 && <span style={pillStyle}><b>{project.note_count}</b> 篇笔记</span>}
        <span style={pillStyle}>{timeAgo(project.accessed_at)}</span>
      </div>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); if (confirm("确定删除此项目及其中的所有文献吗？")) onDelete(project.id) }}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 4,
          }}
        >✕</button>
      )}
    </div>
  )
}

const pillStyle: React.CSSProperties = {
  background: '#212121', border: '1px solid var(--border)', borderRadius: 20,
  padding: '3px 10px', fontSize: 11, color: '#9ca3af',
}

interface User { email: string; name: string; picture: string }

export default function ProjectsPage({ user }: { user: User }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    projectsApi.list().then(setProjects).finally(() => setLoading(false))
  }, [])

  const filtered = projects.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = (project: Project) => {
    setShowModal(false)
    setProjects(prev => [project, ...prev])
  }

  const handleDelete = async (id: string) => {
    const previous = projects
    // Remove immediately so the card cannot remain visible while the
    // destructive request is completing. Restore it if the API rejects.
    setProjects(prev => prev.filter(p => p.id !== id))
    try {
      await projectsApi.delete(id)
    } catch (error) {
      setProjects(previous)
      throw error
    }
  }

  return (
    <div className="projects-home" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#111', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo.png" alt="pdfpal" style={{ width: 32, height: 32 }} />
          <span style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '-0.5px' }}>pdfpal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user.picture && <img src={user.picture} style={{ width: 28, height: 28, borderRadius: '50%' }} alt="" />}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{user.email}</span>
          <button
            onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); location.reload() }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
          >退出登录</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '32px 40px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 className="library-heading" style={{ fontSize: 30, fontWeight: 700, color: '#fff', margin: 0 }}>我的文献工作台</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0 0', lineHeight: 1.6 }}>按项目整理论文，在阅读中提问和记录笔记。</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >＋ 新建项目</button>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', marginBottom: 24 }}>
          <span>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索项目…"
            style={{ flex: 1, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            正在加载项目…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map(p => <ProjectCard key={p.id} project={p} onDelete={handleDelete} />)}
            <div
              onClick={() => setShowModal(true)}
              style={{
                border: '2px dashed #333', borderRadius: 12, display: 'flex',
                flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 160, color: 'var(--muted)', gap: 8, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 28 }}>＋</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>新建项目</div>
            </div>
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>暂无项目</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>点击“新建项目”，然后添加本地 PDF 或论文链接。</div>
          </div>
        )}
      </div>

      {showModal && <NewProjectModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}
    </div>
  )
}
