import {useEffect,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {notesApi,type Note} from '../lib/api'
import NoteWorkbench from '../components/NoteWorkbench'
import ReaderPage from './ReaderPage'
import AiControlPanel from '../components/AiControlPanel'
export default function NoteEditor(){
 const {projectId,noteId}=useParams(),navigate=useNavigate()
 const [note,setNote]=useState<Note>(),[error,setError]=useState('')
 useEffect(()=>{let cancelled=false;if(projectId&&noteId)notesApi.get(projectId,noteId).then(n=>{if(!cancelled)setNote(n)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[projectId,noteId])
 if(error)return <p role="alert">{error}</p>
 if(!note||!projectId)return <div className="empty-state">正在打开笔记…</div>
 if(note.source_id)return <ReaderPage documentSourceId={note.source_id} initialNoteId={note.id}/>
 return <div className="project-note-page"><header className="study-heading"><Link to={`/projects/${projectId}?tab=notes`}>← 项目笔记</Link><h1>项目笔记</h1><AiControlPanel compact minimized/></header><NoteWorkbench projectId={projectId} initialNoteId={note.id} onAnchor={anchor=>navigate(`/projects/${projectId}/sources/${anchor.sourceId}`,{state:{citation:{...anchor,excerpt:anchor.text}}})}/></div>
}
