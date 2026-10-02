import {useEffect,useRef,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import PdfViewer from '../components/PdfViewer'
import ChatPanel from '../components/ChatPanel'
import RelatedPanel from '../components/RelatedPanel'
import AnnotationPanel from '../components/AnnotationPanel'
import AiControlPanel from '../components/AiControlPanel'
import {SourceNotePanel} from '../App'
import {sourcesApi,annotationsApi,uiPreferencesApi,type Source,type Annotation} from '../lib/api'
type Panel='annotations'|'chat'|'notes'|'related'
export default function ReaderPage(){
 const {projectId,sourceId}=useParams(),[source,setSource]=useState<Source|null>(null),[annotations,setAnnotations]=useState<Annotation[]>([]),[panel,setPanel]=useState<Panel>('annotations'),[selected,setSelected]=useState<string|null>(null),[quote,setQuote]=useState(''),[focused,setFocused]=useState(false),[notice,setNotice]=useState(''),[pageRequest,setPageRequest]=useState<{page:number;key:number}|undefined>(),[loading,setLoading]=useState(true)
 const progress=useRef<ReturnType<typeof setTimeout>|null>(null)
 const [noteDirty,setNoteDirty]=useState(false)
 const [topCollapsed,setTopCollapsed]=useState(false)
 const [layoutReady,setLayoutReady]=useState(false)
 const [savingLayout,setSavingLayout]=useState(false)
 useEffect(()=>{
  let cancelled=false
  uiPreferencesApi.get().then(preferences=>{if(!cancelled)setTopCollapsed(preferences.readerTopCollapsed)})
   .catch(()=>{if(!cancelled)setNotice('无法读取顶部布局偏好，可以重新选择。')})
   .finally(()=>{if(!cancelled)setLayoutReady(true)})
  return()=>{cancelled=true}
 },[])
 async function toggleTop(){
  if(!layoutReady||savingLayout)return
  const next=!topCollapsed
  setTopCollapsed(next);setSavingLayout(true)
  try{await uiPreferencesApi.save({readerTopCollapsed:next})}
  catch{setNotice('顶部布局已切换，但未能保存；下次启动可能需要重新选择。')}
  finally{setSavingLayout(false)}
 }
 function changePanel(next:Panel){if(noteDirty && !confirm('注释尚未保存。放弃修改并切换面板吗？'))return;setPanel(next)}
 useEffect(()=>{if(!projectId||!sourceId)return;let cancelled=false;setLoading(true);Promise.all([sourcesApi.get(projectId,sourceId),annotationsApi.list(projectId,sourceId)]).then(([s,a])=>{if(!cancelled){setSource(s);setAnnotations(a)}}).catch(e=>setNotice(e.message)).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[projectId,sourceId])
 useEffect(()=>()=>{if(progress.current)clearTimeout(progress.current)},[])
 if(!projectId||!sourceId)return null
 async function create(data:Omit<Annotation,'id'|'project_id'|'source_id'|'created_at'>,withNote=false){try{const annotation=await annotationsApi.create(projectId!,sourceId!,data);setAnnotations(previous=>[...previous,annotation]);setSelected(annotation.id);if(withNote){setFocused(false);setPanel('annotations')}setNotice(withNote?'已创建标注，请在右侧填写注释。':'高亮已保存。')}catch(e){setNotice(e instanceof Error?e.message:'标注保存失败，请重试。')}}
 async function update(id:string,data:{note?:string;color?:string}){const changed=await annotationsApi.update(projectId!,sourceId!,id,data);setAnnotations(previous=>previous.map(a=>a.id===id?changed:a));setNotice('标注已保存。')}
 async function remove(id:string){await annotationsApi.delete(projectId!,sourceId!,id);setAnnotations(previous=>previous.filter(a=>a.id!==id));setSelected(null);setNotice('标注已删除。')}
 function select(annotation:Annotation){setSelected(annotation.id);setPanel('annotations');setFocused(false);setPageRequest({page:annotation.page_number,key:Date.now()})}
 function saveProgress(page:number){if(progress.current)clearTimeout(progress.current);progress.current=setTimeout(()=>{sourcesApi.updateLastPageRead(projectId!,sourceId!,page).catch(()=>{})},500)}
 return <div className="reading-workspace">
  <div className={`reader-topbar ${topCollapsed?'is-collapsed':''}`}>
   <header className="reading-header">
    <Link to={`/projects/${projectId}`} className="reader-back">← 返回项目</Link>
    <div className="reading-title">
     <h1 title={source?.title}>{source?.title||'正在加载文献…'}</h1>
     {!topCollapsed&&<span>{source?.pages||0} 页 <span className="status-dot"/>本地 PDF</span>}
    </div>
    <div className="reader-header-actions">
     <button type="button" className="secondary reader-top-toggle" aria-expanded={!topCollapsed}
      disabled={!layoutReady} aria-disabled={savingLayout} onClick={()=>void toggleTop()}
      title={topCollapsed?'展开文献信息与 AI 用量':'将顶部缩成工具栏，扩大阅读区域'}>
      <span aria-hidden="true">{topCollapsed?'⌄':'⌃'}</span>{topCollapsed?'展开顶部':'收起顶部'}
     </button>
     <button className={focused?'primary':'secondary'} aria-pressed={focused} onClick={()=>setFocused(value=>!value)}>{focused?'显示阅读面板':'专注阅读'}</button>
    </div>
   </header>
   <AiControlPanel compact minimized={topCollapsed}/>
  </div>
  {(notice||!topCollapsed)&&<div className={`reading-notice ${topCollapsed?'is-floating':''}`} aria-live="polite">{notice||'选中文字以高亮、添加注释或向 AI 提问。'}{notice&&<button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button>}</div>}
  <main id="main-content" className={`reading-layout ${focused?'is-focused':''}`}><section className="paper-stage" aria-label="PDF 阅读区">{loading?<div className="empty-state"><span className="spinner"/>正在加载 PDF…</div>:source?<PdfViewer key={source.id} url={`/api/projects/${projectId}/sources/${sourceId}/file`} pages={source.pages} initialPage={source.last_page_read} pageRequest={pageRequest} annotations={annotations} onPageChange={saveProgress} onTextSelected={text=>{setQuote(text);setFocused(false);setPanel('chat')}} onHighlightCreate={data=>create(data)} onNoteCreate={data=>create(data,true)} onHighlightClick={select} onHighlightDelete={remove}/>:<p className="error-message">无法打开 PDF，请返回项目重试。</p>}</section>{!focused&&<aside className="reading-panel"><nav className="reading-panel-tabs" aria-label="阅读工具">{([['annotations','标注'],['chat','AI 对话'],['notes','笔记'],['related','相关论文']] as [Panel,string][]).map(([id,label])=><button key={id} className={panel===id?'active':''} aria-pressed={panel===id} onClick={()=>changePanel(id)}>{label}{id==='annotations'&&annotations.length>0&&<span>{annotations.length}</span>}</button>)}</nav><div className="reading-panel-body">{panel==='annotations'&&<AnnotationPanel annotations={annotations} selectedId={selected} onSelect={select} onUpdate={update} onDelete={remove} onDirtyChange={setNoteDirty}/>} {panel==='chat'&&<ChatPanel pdfText={source?.pdf_text||''} pdfUrl={source?.url||''} disabled={!source} selectedText={quote} onSelectedTextUsed={()=>setQuote('')} projectId={projectId} sourceId={sourceId}/>} {panel==='notes'&&<SourceNotePanel projectId={projectId} sourceId={sourceId}/>} {panel==='related'&&source&&<RelatedPanel projectId={projectId} sourceId={sourceId} sourceUrl={source.url||''}/>}</div></aside>}</main></div>
}
