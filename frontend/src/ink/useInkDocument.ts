import {useEffect,useRef,useState} from 'react'
import type {InkDocument,InkTarget,InkBlock} from '../../../src/core/ink-types'
import {readDraft,writeDraft,claimDraft,pendingInk} from './draft-store'
export function useInkDocument(projectId:string,target:InkTarget){
 const key=JSON.stringify([projectId,target,1]),url=`/api/projects/${projectId}/ink`
 const [document,setDocument]=useState<InkDocument>({version:1,revision:0,target,blocks:[]})
 const [status,setStatus]=useState('正在读取手写…'),[ready,setReady]=useState(false)
 const [loadVersion,setLoadVersion]=useState(0)
 const [baseline,setBaseline]=useState(0)
 const owner=useRef(crypto.randomUUID())
 const state=useRef({document,sequence:0,conflict:false,loading:true,serverCopy:undefined as InkDocument|undefined})
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),uploading=useRef(false),mounted=useRef(true)
 const localQueue=useRef(Promise.resolve())
 function persist(pending=true){const draft=structuredClone({document:state.current.document,sequence:state.current.sequence,pending,serverCopy:state.current.serverCopy,owner:owner.current});localQueue.current=localQueue.current.catch(()=>{}).then(()=>writeDraft(key,draft));return localQueue.current}
 async function upload(){
  if(uploading.current||state.current.conflict||state.current.loading)return
  uploading.current=true
  const sequence=state.current.sequence,snapshot=structuredClone(state.current.document)
  try{
   await localQueue.current
   if(mounted.current)setStatus('手写保存中…')
   const response=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:snapshot,expectedRevision:snapshot.revision})})
   if(response.status===409){state.current.conflict=true;const query=new URLSearchParams(Object.entries(target).map(([k,v])=>[k,String(v)]));const remote=await fetch(`${url}?${query}`);const serverCopy=remote.ok?await remote.json():undefined;state.current.serverCopy=serverCopy;await persist();throw new Error('手写版本冲突，本机与服务器副本已保留')}
   if(!response.ok)throw new Error('手写保存失败，待重试')
   const saved:InkDocument=await response.json()
   state.current.document={...state.current.document,revision:saved.revision}
   await persist(sequence!==state.current.sequence)
   if(sequence===state.current.sequence){pendingInk.delete(key);window.dispatchEvent(new Event('bbgddg:ink-saved'))}
   if(mounted.current){setDocument(state.current.document);setStatus(sequence===state.current.sequence?'手写已保存':'手写保存中…')}
  }catch(error){if((error as Error).message.includes('另一窗口'))state.current.conflict=true;if(mounted.current)setStatus((error as Error).message)}finally{uploading.current=false;if(!state.current.conflict&&sequence!==state.current.sequence)timer.current=setTimeout(()=>void upload(),500)}
 }
 useEffect(()=>{
  let active=true
  mounted.current=true
  const query=new URLSearchParams(Object.entries(target).map(([k,v])=>[k,String(v)]))
  void(async()=>{try{
   const local=await claimDraft(key,owner.current,{document:state.current.document,sequence:0,pending:false})
   const response=await fetch(`${url}?${query}`)
   if(!response.ok)throw new Error('无法读取服务器手写')
   const remote:InkDocument=await response.json()
   if(!active)return
   const pending=!!local&&local.pending!==false
   const conflict=pending&&(!!local.serverCopy||local.document.revision!==remote.revision)
   const chosen=pending?local.document:remote
   state.current={document:chosen,sequence:local?.sequence||0,conflict,loading:false,serverCopy:conflict?remote:undefined}
   if(conflict)await persist()
   setDocument(chosen);setReady(true);setStatus(conflict?'手写版本冲突，本机副本已保留':'手写已就绪')
   if(pending&&!conflict)timer.current=setTimeout(()=>void upload(),500)
  }catch(error){const local=await readDraft(key).catch(()=>undefined);if(!active)return;if(local){state.current={document:local.document,sequence:local.sequence,conflict:!!local.serverCopy,loading:false,serverCopy:local.serverCopy};setDocument(local.document);setReady(true)}setStatus(`${(error as Error).message}，待重试`)}})()
  return()=>{active=false;mounted.current=false;clearTimeout(timer.current)}
 },[key,loadVersion])
 function change(blocks:InkBlock[]){if(!ready)return;pendingInk.add(key);state.current.document={...state.current.document,blocks};state.current.sequence++;setDocument(state.current.document);setStatus(state.current.conflict?'手写版本冲突，本机副本已保留':'手写保存中…');clearTimeout(timer.current);void persist().then(()=>{timer.current=setTimeout(()=>void upload(),500)}).catch(error=>{if((error as Error).message.includes('另一窗口')){state.current.conflict=true;setStatus((error as Error).message)}else setStatus('本机草稿保存失败，请勿关闭页面')});}
 function downloadDraft(){const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,local:state.current.document,server:state.current.serverCopy},null,2)],{type:'application/json'})),link=window.document.createElement('a');link.href=url;link.download='BBGDDG-手写冲突副本.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 async function useServer(){if(!state.current.serverCopy||!confirm('保留本机冲突副本，并采用服务器版本继续编辑？'))return;await writeDraft(`${key}:conflict:${Date.now()}`,{document:state.current.document,sequence:state.current.sequence,pending:false,serverCopy:state.current.serverCopy});downloadDraft();state.current={...state.current,document:state.current.serverCopy,conflict:false,serverCopy:undefined};await persist(false);pendingInk.delete(key);setDocument(state.current.document);setBaseline(v=>v+1);setStatus('手写已保存')}
 return {document,status,ready,baseline,change,retry:()=>ready?void upload():setLoadVersion(v=>v+1),conflict:state.current.conflict,canAdopt:!!state.current.serverCopy,downloadDraft,useServer:()=>void useServer().catch(()=>setStatus('无法保留冲突副本，请勿关闭页面'))}
}
