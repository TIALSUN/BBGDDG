import NoteList from './notes/NoteList'
import NoteInkBlocks from '../ink/NoteInkBlocks'
import {hasPendingInk} from '../ink/draft-store'
import {printNote} from '../ink/print-note'
import type {InkDocument} from '../../../src/core/ink-types'
import NoteEditorBody from './notes/NoteEditorBody'
import {useEffect,useRef,useState} from 'react'
import {annotationsApi,notesApi,sourcesApi,type Source,type Note,type NoteAnchor,type Annotation} from '../lib/api'

export type NoteDraft={title:string;content:string;anchors:NoteAnchor[];tags:string[];origin?:Note['origin'];id?:string}
export default function NoteWorkbench({projectId,sourceId,initialNoteId,onAnchor,draftRequest,onSaved}: {
  projectId:string;sourceId?:string;initialNoteId?:string;onAnchor?:(anchor:NoteAnchor)=>void;
  draftRequest?:{key:number;draft:NoteDraft};onSaved?:()=>void;
}){
  const storageKey=`bbgddg:draft:${projectId}:${sourceId||'project'}:${initialNoteId||'list'}`
  const empty=():NoteDraft=>({title:'未命名笔记',content:'',anchors:[],tags:[]})
  const [draft,setDraft]=useState<NoteDraft>(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)||'null')||empty()}catch{return empty()}})
  const [notes,setNotes]=useState<Note[]>([]),[annotations,setAnnotations]=useState<Annotation[]>([])
  const [dirty,setDirty]=useState(()=>!!sessionStorage.getItem(storageKey)),[preview,setPreview]=useState(true)
  const [query,setQuery]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[ready,setReady]=useState(false)
  const [referenceSources,setReferenceSources]=useState<Source[]>([]),[referenceSource,setReferenceSource]=useState(sourceId||''),[referencePage,setReferencePage]=useState('1'),[referenceText,setReferenceText]=useState('')
  useEffect(()=>{sourcesApi.list(projectId).then(setReferenceSources).catch(e=>setError(e.message))},[projectId])
  const revision=useRef(0)
  function change(value:NoteDraft){revision.current++;setDraft(value);setDirty(true);sessionStorage.setItem(storageKey,JSON.stringify(value))}
  async function reload(){const list=sourceId?await notesApi.listBySource(projectId,sourceId):await notesApi.list(projectId);setNotes(sourceId?list:list.filter(n=>!n.source_id));if(sourceId)setAnnotations(await annotationsApi.list(projectId,sourceId))}
  useEffect(()=>{let cancelled=false;reload().then(async()=>{if(initialNoteId&&!sessionStorage.getItem(storageKey)){const note=await notesApi.get(projectId,initialNoteId);if(!cancelled)setDraft({id:note.id,title:note.title,content:note.content||'',anchors:note.anchors||[],tags:note.tags||[],origin:note.origin})}if(!cancelled)setReady(true)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[projectId,sourceId,initialNoteId])
  useEffect(()=>{if(draftRequest&&(!dirty||confirm('当前笔记有未保存草稿，替换为新的摘录或原文笔记？'))){change(draftRequest.draft);setPreview(false)}},[draftRequest?.key])
  async function open(note:Note){if(dirty&&!confirm('当前草稿尚未保存，放弃草稿并打开其他笔记？'))return;try{const full=await notesApi.get(projectId,note.id);setDraft({id:full.id,title:full.title,content:full.content||'',anchors:full.anchors||[],tags:full.tags||[],origin:full.origin});setDirty(false);sessionStorage.removeItem(storageKey);setError('')}catch(e){setError((e as Error).message)}}
  async function save(){if(saving||!draft.title.trim())return;const current=revision.current,snapshot=draft;setSaving(true);setError('');try{const payload={...snapshot,tags:snapshot.tags.map(t=>t.trim()).filter(Boolean),source_id:sourceId};const id=snapshot.id||(await notesApi.create(projectId,payload)).id;if(snapshot.id)await notesApi.update(projectId,id,payload);if(revision.current===current){setDraft({...snapshot,id});setDirty(false);sessionStorage.removeItem(storageKey)}else{setDraft(value=>{const next={...value,id};sessionStorage.setItem(storageKey,JSON.stringify(next));return next})}await reload();onSaved?.()}catch(e){setError(`保存失败，草稿已保留：${(e as Error).message}`)}finally{setSaving(false)}}
  if(!ready)return <section className="note-workbench"><p role={error?'alert':'status'}>{error||'正在打开笔记…'}</p>{error&&<button className="secondary" onClick={()=>window.location.reload()}>重试</button>}</section>
  const list=notes.filter(n=>`${n.title} ${n.preview} ${(n.tags||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(a.anchors?.[0]?.page??Infinity)-(b.anchors?.[0]?.page??Infinity)||a.created_at.localeCompare(b.created_at))
  return <section className="note-workbench" aria-label="文献笔记编辑器">
    <div className="note-toolbar"><strong>{sourceId?'文献笔记':'项目笔记'}</strong><button className="secondary" onClick={()=>{if(!dirty||confirm('放弃当前未保存草稿并新建？')){change(empty());setPreview(false)}}}>新建笔记</button><button className="primary" disabled={saving||!ready||!draft.title.trim()} onClick={()=>void save()}>{saving?'保存中…':'保存笔记'}</button><span role="status">{dirty?'草稿已保留':'已保存'}</span></div>
    {error&&<p role="alert" className="error-message">{error}<button className="text-button" onClick={()=>void reload().then(()=>setReady(true)).catch(e=>setError(e.message))}>重试</button></p>}
    <label className="note-search">搜索笔记或标签<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="标题、内容或标签"/></label>
    <details className="note-browser" open><summary>已保存笔记 · {list.length}</summary><NoteList notes={list} activeId={draft.id} onOpen={note=>void open(note)}/></details>
    {annotations.some(a=>a.note)&&<details className="legacy-notes"><summary>已有原文注释</summary>{annotations.filter(a=>a.note).map(a=><div key={a.id}><button className="text-button" onClick={()=>onAnchor?.({sourceId:sourceId!,page:a.page_number,text:a.text,rects:a.rects||[{x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2}]})}>PDF 第 {a.page_number} 页 · {a.text.slice(0,45)}</button><p>{a.note}</p><button className="secondary" onClick={()=>{if(!dirty||confirm('放弃草稿并整理此注释？')){change({title:a.text.slice(0,40)||'原文笔记',content:a.note||'',anchors:[{sourceId:sourceId!,page:a.page_number,text:a.text,rects:a.rects||[{x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2}]}],tags:[]});setPreview(false)}}}>整理为笔记草稿</button></div>)}</details>}
    <label className="note-field">标题<input placeholder="笔记标题…" value={draft.title} onChange={e=>change({...draft,title:e.target.value})}/></label>
    <label className="note-field">标签（逗号分隔）<input value={draft.tags.join(',')} onChange={e=>change({...draft,tags:e.target.value.split(/[,，]/)})}/></label>
    <details className="reference-editor"><summary>添加原文引用</summary><label>文献<select aria-label="引用文献" value={referenceSource} onChange={e=>setReferenceSource(e.target.value)}><option value="">选择文献</option>{referenceSources.map(s=><option value={s.id} key={s.id}>{s.title}</option>)}</select></label><label>{referenceSources.find(s=>s.id===referenceSource)?.type==="text"?"段落编号":"PDF 页序号"}<input aria-label="引用页码" type="number" min="1" value={referencePage} onChange={e=>setReferencePage(e.target.value)}/></label><label>原文片段<input aria-label="引用原文" value={referenceText} onChange={e=>setReferenceText(e.target.value)}/></label><button className="secondary" disabled={!referenceSource||!Number.isInteger(Number(referencePage))||Number(referencePage)<1} onClick={()=>change({...draft,anchors:[...draft.anchors,{sourceId:referenceSource,unit:referenceSources.find(s=>s.id===referenceSource)?.type==="text"?"paragraph":"page",page:Number(referencePage),text:referenceText,rects:[]}]})}>添加引用</button></details>
    <div className="note-links">{draft.anchors.map((anchor,i)=><button className="reference-jump" key={i} onClick={()=>onAnchor?.(anchor)}>回到原文 · {anchor.unit==='paragraph'?'第':'PDF 第'} {anchor.page} {anchor.unit==='paragraph'?'段':'页'}：{anchor.text.slice(0,60)}</button>)}</div>
    <button className="text-button" onClick={()=>setPreview(v=>!v)}>{preview?'编辑正文':'预览正文'}</button>
    <button className="secondary" disabled={!draft.id||dirty} onClick={async()=>{try{if(await hasPendingInk(projectId,draft.id!))throw new Error("手写尚未保存，请稍后重试。");const note=await notesApi.get(projectId,draft.id!);const response=await fetch(`/api/projects/${projectId}/ink?kind=note&noteId=${draft.id}`);if(!response.ok)throw new Error("无法读取手写，请重试。");const ink:InkDocument=await response.json();const ids=[...new Set(ink.blocks.flatMap(b=>(b.images||[]).map(i=>i.attachmentId)))];await printNote(note,ink,ids.map(id=>({id,url:`/api/projects/${projectId}/ink/attachments/${id}`,width:0,height:0})))}catch(error){setError((error as Error).message)}}}>打印笔记 / 存储为 PDF</button><NoteEditorBody draft={draft} onChange={change} preview={preview}/>
    {draft.id?<NoteInkBlocks key={draft.id} projectId={projectId} noteId={draft.id}/>:<p className="muted">先保存笔记，即可添加手写块。</p>}
    {draft.origin&&<details className="note-origin"><summary>AI 摘录来源（需自行核实）</summary><p>{draft.origin.content}</p><small>{draft.origin.createdAt}</small></details>}
  </section>
}
