import {useEffect, useState} from 'react'
import {Link} from 'react-router-dom'
import {projectsApi, type Project} from '../lib/api'
import {NewProjectModal} from './ProjectsPage'
import {Brand, EmptyState} from '../components/WorkspaceUI'
import {timeAgo} from '../lib/time'
import AiControlPanel from '../components/AiControlPanel'
import './library.css'

function LibraryIcon({name}: {name: 'folder' | 'clock' | 'search' | 'menu' | 'settings'}) {
 const paths = {folder: 'M3 7V5h6l2 2h10v13H3V7Z', clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', menu: 'M4 6h16M4 12h16M4 18h16', settings: 'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'}
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
}

export default function LibraryPage() {
 const [projects, setProjects] = useState<Project[]>([])
 const [loading, setLoading] = useState(true)
 const [query, setQuery] = useState('')
 const [modal, setModal] = useState(false)
 const [error, setError] = useState('')
 const [recentOnly, setRecentOnly] = useState(false)
 const [collapsed, setCollapsed] = useState(false)
 function loadProjects() {
  setLoading(true); setError('')
  projectsApi.list().then(setProjects).catch(e => setError(e.message)).finally(() => setLoading(false))
 }
 useEffect(() => { loadProjects() }, [])
 async function remove(project: Project) {
  if (!confirm(`删除项目“${project.title}”及其中的文献、笔记吗？`)) return
  try { await projectsApi.delete(project.id); setProjects(previous => previous.filter(p => p.id !== project.id)) }
  catch (e) { setError(e instanceof Error ? e.message : '删除失败，请重试。') }
 }
 const shown = projects.filter(p => `${p.title} ${p.description}`.toLowerCase().includes(query.trim().toLowerCase()))
 const recent = [...shown].sort((a,b) => b.accessed_at.localeCompare(a.accessed_at))
 const listed = recentOnly ? recent.slice(0,6) : shown
 return <div className={`workbench library-workbench ${collapsed ? 'navigation-collapsed' : ''}`}>
  <aside className="navigation">
   <div className="library-brand-row"><Brand/><button className="library-toggle" aria-label="切换首页侧栏" aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}><LibraryIcon name="menu"/></button></div>
   <nav className="workspace-nav" aria-label="文献库导航">
    <button className={!recentOnly ? 'active' : ''} aria-pressed={!recentOnly} onClick={() => setRecentOnly(false)}><LibraryIcon name="folder"/><span>所有项目</span><small>{projects.length}</small></button>
    <button className={recentOnly ? 'active' : ''} aria-pressed={recentOnly} onClick={() => setRecentOnly(true)}><LibraryIcon name="clock"/><span>最近项目</span></button>
    <Link to="/settings"><LibraryIcon name="settings"/><span>设置</span></Link>
   </nav>
   <div className="nav-bottom"><span className="status-dot"/>本地工作区<small>文献保存在这台电脑</small></div>
  </aside>
  <main id="main-content" className="library-main"><div className="library-content">
   <header className="page-heading"><div><p className="breadcrumb">文献库</p><h1>我的项目</h1><p>从上次停下的地方，继续阅读与思考。</p></div><button className="primary" onClick={() => setModal(true)}>＋ 新建项目</button></header>
   <div className="library-ai"><AiControlPanel compact minimized/></div>
   {error && <div role="alert" className="library-error"><span>{error}</span><button className="secondary" onClick={loadProjects}>重新加载</button></div>}
   {loading ? <div className="library-loading" role="status"><span className="spinner"/>正在加载项目…</div> : <>
    {!recentOnly && !query.trim() && projects.length > 0 && <section className="library-resume" aria-labelledby="resume-heading">
     <div className="library-section-heading"><h2 id="resume-heading">继续学习</h2><span>最近打开的项目</span></div>
     <div className="library-resume-grid">{recent.slice(0,3).map(p => <Link key={p.id} to={`/projects/${p.id}`} className="library-resume-card"><LibraryIcon name="folder"/><strong>{p.title}</strong><span>{p.source_count} 篇文献</span><small>{timeAgo(p.accessed_at)}</small></Link>)}</div>
    </section>}
    <section aria-labelledby="projects-heading">
     <div className="library-list-toolbar"><div className="library-section-heading"><h2 id="projects-heading">{recentOnly ? '最近项目' : '全部项目'}</h2><span aria-live="polite">{listed.length} 个项目</span></div>
      <label className="search-field"><LibraryIcon name="search"/><input name="projectSearch" autoComplete="off" aria-label="搜索项目" placeholder="搜索项目名称或描述…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="清除项目搜索" onClick={() => setQuery('')}>×</button>}</label>
     </div>
     <div className="project-list">{listed.map(project => <article className="project-card" key={project.id}>
      <Link to={`/projects/${project.id}`} className="project-card-link"><span className="project-file-icon"><LibraryIcon name="folder"/></span><div><h2>{project.title}</h2><p>{project.description || '添加文献，开始阅读与记录。'}</p><div className="project-meta"><span>{project.source_count} 篇文献</span><span>{project.note_count} 篇笔记</span><span>最近打开 {timeAgo(project.accessed_at)}</span></div></div></Link>
      <details className="project-menu"><summary aria-label={`项目${project.title}的更多操作`}>•••</summary><button className="project-delete" aria-label={`删除项目${project.title}`} onClick={() => remove(project)}>删除项目</button></details>
     </article>)}</div>
     {!listed.length && !error && <><EmptyState title={query ? '没有匹配的项目' : '开始你的第一个学习项目'}>{query ? '尝试其他关键词，或清除搜索查看全部项目。' : '为一个研究主题创建项目，再添加文献和笔记。'}</EmptyState><div className="library-empty-action"><button className="secondary" onClick={() => query ? setQuery('') : setModal(true)}>{query ? '清除搜索' : '创建第一个项目'}</button></div></>}
    </section>
   </>}
   <footer className="library-footer">BBGDDG <span>为认真阅读留出空间。</span></footer>
  </div></main>
  {modal && <NewProjectModal onClose={() => setModal(false)} onCreate={project => {setProjects(previous => [project,...previous]); setModal(false)}}/>}
 </div>
}
