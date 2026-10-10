import {useState} from 'react'
import Dialog from './ui/Dialog'
import {hasPendingInk} from '../ink/draft-store'
export default function ExportDialog({projectId,sourceId}:{projectId:string;sourceId:string}){
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function download(){setBusy(true);setError('');try{if(await hasPendingInk(projectId,sourceId))throw new Error('仍有手写尚未保存，请先完成同步或处理冲突。');const response=await fetch(`/api/projects/${projectId}/exports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'source',id:sourceId})});if(!response.ok)throw new Error((await response.json()).detail||'导出失败。');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='标注文献.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setOpen(false)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <><button className="secondary" onClick={()=>setOpen(true)}>导出标注 PDF</button>{open&&<Dialog open={open} title="导出标注 PDF" onClose={()=>setOpen(false)}><p>导出整篇文献，合并已保存的高光与笔迹，另存为 PDF 副本。</p><p>可编辑笔迹请另行备份。</p>{error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={()=>void download()}>{busy?'正在生成…':'下载 PDF 副本'}</button></Dialog>}</>
}
