import {useEffect,useRef,useState} from 'react'
import {Link,useParams,useNavigate,useLocation} from 'react-router-dom'
import PdfViewer from '../components/PdfViewer'
import ChatPanel from '../components/ChatPanel'
import RelatedPanel from '../components/RelatedPanel'
import AnnotationPanel from '../components/AnnotationPanel'
import AiControlPanel from '../components/AiControlPanel'
import NoteWorkbench,{type NoteDraft} from '../components/NoteWorkbench'
import {sourcesApi,annotationsApi,uiPreferencesApi,type ChatReference,type Source,type Annotation,type NoteAnchor} from '../lib/api'
type Panel='annotations'|'chat'|'notes'|'related'
export default function ReaderPage({documentSourceId,initialNoteId}:{documentSourceId?:string;initialNoteId?:string}={}){
 const {projectId,sourceId:routeSourceId}=useParams(),sourceId=documentSourceId||routeSourceId,[source,setSource]=useState<Source|null>(null),[annotations,setAnnotations]=useState<Annotation[]>([]),[panel,setPanel]=useState<Panel>(()=>documentSourceId||new URLSearchParams(window.location.search).get('mode')==='notes'?'notes':'chat'),[selected,setSelected]=useState<string|null>(null),[quote,setQuote]=useState(''),[focused,setFocused]=useState(()=>!!(documentSourceId||new URLSearchParams(window.location.search).get('mode')==='notes')&&window.innerWidth<=760),[notice,setNotice]=useState(''),[pageRequest,setPageRequest]=useState<{page:number;key:number;excerpt?:string;rects?:NoteAnchor['rects']}|undefined>(),[loading,setLoading]=useState(true)
 const navigate=useNavigate(),location=useLocation()
 const [review,setReview]=useState(()=>!!documentSourceId||new URLSearchParams(location.search).get('mode')==='notes')
 const [draftRequest,setDraftRequest]=useState<{key:number;draft:NoteDraft}>()
 const [selectionAnchor,setSelectionAnchor]=useState<NoteAnchor[]>([])
 const [panelWidth,setPanelWidth]=useState(420)
 const noteId=initialNoteId||new URLSearchParams(location.search).get('note')||undefined
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
 useEffect(()=>{const citation=(location.state as {citation?:ChatReference}|null)?.citation;if(citation&&citation.sourceId===sourceId){setPageRequest({page:citation.page,key:Date.now(),excerpt:citation.excerpt});setNotice('已跳转到引用页；匹配到的原文会临时标亮。')}},[location.key,sourceId])
 if(!projectId||!sourceId)return null
 async function create(data:Omit<Annotation,'id'|'project_id'|'source_id'|'created_at'>,withNote=false){try{const annotation=await annotationsApi.create(projectId!,sourceId!,data);setAnnotations(previous=>[...previous,annotation]);setSelected(annotation.id);if(withNote){setFocused(false);setPanel('notes');setDraftRequest({key:Date.now(),draft:{title:data.text.slice(0,40)||'原文笔记',content:'',tags:[],anchors:[{sourceId:sourceId!,page:data.page_number,text:data.text,rects:data.rects||[{x1:data.x1,y1:data.y1,x2:data.x2,y2:data.y2}]}]}})}setNotice(withNote?'原文已关联，请编辑笔记并保存。':'高亮已保存。')}catch(e){setNotice(e instanceof Error?e.message:'标注保存失败，请重试。')}}
 async function update(id:string,data:{note?:string;color?:string}){const changed=await annotationsApi.update(projectId!,sourceId!,id,data);setAnnotations(previous=>previous.map(a=>a.id===id?changed:a));setNotice('标注已保存。')}
 async function remove(id:string){await annotationsApi.delete(projectId!,sourceId!,id);setAnnotations(previous=>previous.filter(a=>a.id!==id));setSelected(null);setNotice('标注已删除。')}
 function select(annotation:Annotation){setSelected(annotation.id);setPanel('annotations');setFocused(false);setPageRequest({page:annotation.page_number,key:Date.now()})}
 function openReference(reference:ChatReference){if(reference.sourceId===sourceId){setPageRequest({page:reference.page,key:Date.now(),excerpt:reference.excerpt});setNotice('已跳转到引用页；匹配到的原文会临时标亮。')}else navigate('/projects/'+projectId+'/sources/'+reference.sourceId,{state:{citation:reference}})}
 function saveProgress(page:number){if(progress.current)clearTimeout(progress.current);progress.current=setTimeout(()=>{sourcesApi.updateLastPageRead(projectId!,sourceId!,page).catch(()=>{})},500)}
 function openAnchor(anchor:NoteAnchor){if(anchor.sourceId!==sourceId){navigate(`/projects/${projectId}/sources/${anchor.sourceId}`,{state:{citation:{sourceId:anchor.sourceId,page:anchor.page,excerpt:anchor.text}}});return}const changed=anchor.contentHash&&source?.content_hash&&anchor.contentHash!==source.content_hash;setPageRequest({page:anchor.page,key:Date.now(),excerpt:anchor.text,rects:changed?undefined:anchor.rects});setNotice(changed?'文件内容已改变，文字匹配位置需核实。':'已定位笔记对应的原文。');if(review)setFocused(false)}
 return <div className={`reading-workspace ${review?'is-review':''}`}>
  <div className={`reader-topbar ${topCollapsed?'is-collapsed':''}`}>
   <header className="reading-header">
    <Link to={`/projects/${projectId}`} className="reader-back">← 返回项目</Link>
    <div className="reading-title">
     <h1 title={source?.title}>{source?.title||'正在加载文献…'}</h1>
     {!topCollapsed&&<span>{source?.pages||0} 页 <span className="status-dot"/>本地 PDF</span>}
    </div>
    <div className="reader-header-actions"><button className="secondary" onClick={()=>{setReview(v=>!v);setFocused(!review&&window.innerWidth<=760);setPanel('notes')}}>{review?'返回阅读':'笔记复习'}</button>{review&&<button className="secondary" onClick={()=>setFocused(v=>!v)}>{focused?'显示原文':'收起原文'}</button>}
     <button type="button" className="secondary reader-top-toggle" aria-expanded={!topCollapsed}
      disabled={!layoutReady} aria-disabled={savingLayout} onClick={()=>void toggleTop()}
      title={topCollapsed?'展开文献信息与 AI 用量':'将顶部缩成工具栏，扩大阅读区域'}>
      <span aria-hidden="true">{topCollapsed?'⌄':'⌃'}</span>{topCollapsed?'展开顶部':'收起顶部'}
     </button>
     <button className={focused?'primary':'secondary'} aria-pressed={focused} onClick={()=>setFocused(value=>!value)}>{focused?'显示阅读面板':'收起面板'}</button>
    </div>
   </header>
   <AiControlPanel compact minimized/>
  </div>
  {(notice||!topCollapsed)&&<div className={`reading-notice ${topCollapsed?'is-floating':''}`} aria-live="polite">{notice||'选中文字以高亮、添加注释或向 AI 提问。'}{notice&&<button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button>}</div>}
  <main id="main-content" style={{'--panel-width':panelWidth+'px'} as React.CSSProperties} className={`reading-layout study-layout ${focused?'is-focused':''} ${review?'review-layout':''}`}>
   <section className="paper-stage" aria-label="PDF 阅读区">{loading?<div className="empty-state">正在加载 PDF…</div>:source?<PdfViewer key={source.id} url={`/api/projects/${projectId}/sources/${sourceId}/file`} pages={source.pages} initialPage={source.last_page_read} pageRequest={pageRequest} annotations={annotations} onPageChange={saveProgress} onTextSelected={(text,anchors)=>{setQuote(text);setSelectionAnchor((anchors||[]).map(anchor=>({...anchor,sourceId:sourceId!,contentHash:source.content_hash})));setFocused(false);setPanel('chat')}} onHighlightCreate={data=>create(data)} onNoteCreate={data=>create(data,true)} onAnchoredNote={anchors=>{setDraftRequest({key:Date.now(),draft:{title:anchors[0].text.slice(0,40)||'原文笔记',content:'',tags:[],anchors:anchors.map(anchor=>({...anchor,sourceId:sourceId!,contentHash:source.content_hash}))}});setPanel('notes');setFocused(false)}} onHighlightClick={select} onHighlightDelete={remove}/>:<p className="error-message">无法打开 PDF，请返回项目重试。</p>}</section>
   <aside className="reading-panel study-panel" hidden={focused&&!review}>
    <nav className="reading-panel-tabs" aria-label="阅读工具">{([['chat','AI 问答'],['notes','笔记']] as [Panel,string][]).map(([id,label])=><button key={id} className={panel===id?'active':''} aria-pressed={panel===id} onClick={()=>changePanel(id)}>{label}</button>)}<details className="panel-more"><summary>更多</summary><button onClick={()=>changePanel('annotations')}>标注管理</button><button onClick={()=>changePanel('related')}>相关论文</button></details><button aria-label="收起面板" onClick={()=>setFocused(true)}>›</button></nav>
    <label className="panel-width">面板宽度<input aria-label="面板宽度" type="range" min="320" max="720" value={panelWidth} onChange={e=>setPanelWidth(Number(e.target.value))}/></label>
    <div className="reading-panel-body">
     <div className="retained-panel" hidden={panel!=='chat'}><ChatPanel key={sourceId} pdfText={source?.pdf_text||''} pdfUrl={source?.url||''} disabled={!source} selectedText={quote} selectedAnchors={selectionAnchor} onSelectedTextUsed={()=>setQuote('')} projectId={projectId} sourceId={sourceId} onReference={openReference} onExtract={(content,anchors)=>{setDraftRequest({key:Date.now(),draft:{title:'阅读问答笔记',content,tags:[],anchors,origin:{kind:'ai',content,createdAt:new Date().toISOString()}}});setPanel('notes');setFocused(false)}}/></div>
     <div className="retained-panel" hidden={panel!=='notes'}><NoteWorkbench key={sourceId} projectId={projectId} sourceId={sourceId} initialNoteId={noteId} draftRequest={draftRequest} onAnchor={openAnchor}/></div>
     <div className="retained-panel" hidden={panel!=='annotations'}><AnnotationPanel annotations={annotations} selectedId={selected} onSelect={select} onUpdate={update} onDelete={remove} onDirtyChange={setNoteDirty}/></div>
     {source&&<div className="retained-panel" hidden={panel!=='related'}><RelatedPanel projectId={projectId} sourceId={sourceId} sourceUrl={source.url||''}/></div>}
    </div>
   </aside>
   {focused&&<nav className="study-rail" aria-label="展开阅读工具"><button onClick={()=>{setFocused(false);setPanel('chat')}}>AI</button><button onClick={()=>{setFocused(false);setPanel('notes')}}>笔记</button>{review&&<button onClick={()=>setFocused(false)}>原文</button>}</nav>}
  </main></div>
}
