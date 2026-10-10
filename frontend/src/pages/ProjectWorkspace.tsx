import WorkspaceShell from '../components/WorkspaceShell'
import Icon,{type IconName} from '../components/ui/Icon'
import {useEffect,useState} from 'react'
import {Link,useParams,useSearchParams} from 'react-router-dom'
import {projectsApi,type Project} from '../lib/api'
import {SourcesTab,ChatsTab,SearchTab,HighlightsTab} from './ProjectView'
import AiControlPanel from '../components/AiControlPanel'
import ProjectNotes from '../components/ProjectNotes'
import {Brand} from '../components/WorkspaceUI'
const tabs:[string,IconName,string][]=[['sources','folder','文献'],['notes','notes','笔记'],['highlights','mark','标注'],['chats','chat','对话']]
export default function ProjectWorkspace(){
 const {projectId}=useParams(),[params,setParams]=useSearchParams(),[project,setProject]=useState<Project|null>(null),[error,setError]=useState('')
 const requestedTab=params.get('tab')||'sources'
 const tab=['sources','notes','highlights','chats','search'].includes(requestedTab)?requestedTab:'sources'
 useEffect(()=>{if(projectId)projectsApi.get(projectId).then(setProject).catch(e=>setError(e.message))},[projectId])
 if(!projectId)return null
 function rename(){if(!project)return;const title=prompt('项目名称',project.title);if(title?.trim())projectsApi.update(projectId!,{title:title.trim()}).then(()=>setProject({...project!,title:title.trim()})).catch(e=>setError(e.message))}
 return <div className="workbench project-workspace"><WorkspaceShell navigation={<aside className="navigation"><Brand/><Link to="/" className="back-library">← 所有项目</Link><div className="project-identity"><h1>{project?.title||'正在加载…'}</h1><p>{project?.description||'研究工作区'}</p></div><nav className="workspace-nav" aria-label="项目导航">{tabs.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setParams({tab:id})}><Icon name={icon}/>{label}</button>)}</nav><div className="nav-bottom"><button onClick={rename} className="text-button">项目设置：修改名称</button><Link className="primary" to={`/projects/${projectId}/chat`}>项目对话</Link><small>对整个项目中的文献提问</small></div></aside>}><main id="main-content" className="project-main"><header className="project-topbar"><span>{project?.title}</span><button className="secondary" onClick={()=>setParams({tab:'search'})}>项目内搜索</button><AiControlPanel compact minimized/></header>{error&&<p role="alert" className="error-message">{error}</p>}{tab==='sources'&&<SourcesTab projectId={projectId}/>} {tab==='notes'&&<ProjectNotes projectId={projectId}/>} {tab==='chats'&&<ChatsTab projectId={projectId}/>} {tab==='search'&&<SearchTab projectId={projectId}/>} {tab==='highlights'&&<HighlightsTab projectId={projectId}/>}</main></WorkspaceShell></div>
}
