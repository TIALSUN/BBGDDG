import {useEffect,useState} from 'react'
import {Link,useParams,useSearchParams} from 'react-router-dom'
import {projectsApi,type Project} from '../lib/api'
import {SourcesTab,NotesTab,ChatsTab,SearchTab,HighlightsTab} from './ProjectView'
import {Brand} from '../components/WorkspaceUI'
const tabs=[['sources','▤','文献'],['highlights','▧','标注'],['notes','▱','笔记'],['chats','◌','对话历史'],['search','⌕','全文搜索']]
export default function ProjectWorkspace(){
 const {projectId}=useParams(),[params,setParams]=useSearchParams(),[project,setProject]=useState<Project|null>(null),[error,setError]=useState('')
 const tab=params.get('tab')||'sources'
 useEffect(()=>{if(projectId)projectsApi.get(projectId).then(setProject).catch(e=>setError(e.message))},[projectId])
 if(!projectId)return null
 function rename(){if(!project)return;const title=prompt('项目名称',project.title);if(title?.trim())projectsApi.update(projectId!,{title:title.trim()}).then(()=>setProject({...project!,title:title.trim()})).catch(e=>setError(e.message))}
 return <div className="workbench"><aside className="navigation"><Brand/><Link to="/" className="back-library">← 所有项目</Link><div className="project-identity"><h1>{project?.title||'正在加载…'}</h1><p>{project?.description||'研究工作区'}</p><button onClick={rename} className="text-button">编辑项目名称</button></div><nav className="workspace-nav" aria-label="项目导航">{tabs.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setParams({tab:id})}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav><div className="nav-bottom"><Link className="primary" to={`/projects/${projectId}/chat`}>项目对话</Link><small>对整个项目中的文献提问</small></div></aside><main id="main-content" className="project-main">{error&&<p role="alert" className="error-message">{error}</p>}{tab==='sources'&&<SourcesTab projectId={projectId}/>} {tab==='notes'&&<NotesTab projectId={projectId}/>} {tab==='chats'&&<ChatsTab projectId={projectId}/>} {tab==='search'&&<SearchTab projectId={projectId}/>} {tab==='highlights'&&<HighlightsTab projectId={projectId}/>}</main></div>
}
