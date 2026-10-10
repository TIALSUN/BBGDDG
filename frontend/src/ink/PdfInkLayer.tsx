import InkConflictActions from './InkConflictActions'
import {useRef,useState,useEffect} from 'react'
import {selectPdfText} from './text-selection'
import {mapPoint,inverse} from './geometry'
import {captureRegion} from './region-capture'
import {useInkDocument} from './useInkDocument'
import InkCanvas from './InkCanvas'
import {InkHistory} from './history'
import type {InkSettings} from './InkToolbar'
import type {Matrix} from './geometry'
import type {InkBlock,InkPoint} from '../../../src/core/ink-types'
export type PdfInkContext={projectId:string;sourceId:string;contentHash:string}
export default function PdfInkLayer({context,page,viewport,settings,renderReady}:{renderReady:boolean;context:PdfInkContext;page:number;viewport:{width:number;height:number;transform:Matrix};settings:InkSettings}){
 const ink=useInkDocument(context.projectId,{kind:'pdf',sourceId:context.sourceId,page,contentHash:context.contentHash})
 const history=useRef<InkHistory|null>(null)
 const baseline=useRef(ink.baseline)
 if(baseline.current!==ink.baseline){baseline.current=ink.baseline;history.current=null}
 const container=useRef<HTMLDivElement>(null),[selectionMessage,setSelectionMessage]=useState('')
 const [region,setRegion]=useState<{blob:Blob;rect:[number,number,number,number]}|null>(null),[noteLink,setNoteLink]=useState('')
 const block:InkBlock=ink.document.blocks[0]||{id:`page-${page}`,height:viewport.height,background:'blank',strokes:[]}
 function change(next:InkBlock){history.current??=new InkHistory(ink.document.blocks);ink.change(history.current.apply({type:'replaceBlocks',blocks:[next]}))}
 useEffect(()=>{const underline=(event:Event)=>{const detail=(event as CustomEvent<{sourceId:string;anchors:{page:number;rects:{x1:number;y1:number;x2:number;y2:number}[]}[]}>).detail;if(detail.sourceId!==context.sourceId)return;const anchor=detail.anchors.find(a=>a.page===page);if(!anchor)return;if(!ink.ready){setSelectionMessage('手写尚未就绪，请先重试读取。');return}const matrix=inverse(viewport.transform);change({...block,strokes:[...block.strokes,...anchor.rects.map(rect=>({id:crypto.randomUUID(),tool:'line' as const,color:'#111827',width:1.5,points:[mapPoint({x:rect.x1*viewport.width,y:rect.y2*viewport.height},matrix),mapPoint({x:rect.x2*viewport.width,y:rect.y2*viewport.height},matrix)]}))]})};window.addEventListener('bbgddg:ink-underline',underline);return()=>window.removeEventListener('bbgddg:ink-underline',underline)},[ink.document,ink.ready,viewport,page,context.sourceId])
 function selectText(points:InkPoint[]){const pageElement=container.current?.parentElement,box=pageElement?.getBoundingClientRect();if(!pageElement||!box)return;function screen(p:InkPoint){const local=mapPoint(p,viewport.transform);return {x:box!.left+local.x/viewport.width*box!.width,y:box!.top+local.y/viewport.height*box!.height}}setSelectionMessage(selectPdfText(pageElement,screen(points[0]),screen(points.at(-1)!))?'':'此页没有可选文字，可使用区域摘录。')}
 async function selectRegion(points:InkPoint[]){try{const canvas=container.current?.parentElement?.querySelector('canvas');if(!canvas)throw new Error('页面尚未就绪。');const a=mapPoint(points[0],viewport.transform),b=mapPoint(points.at(-1)!,viewport.transform);const rect=[Math.max(0,Math.min(a.x,b.x)/viewport.width),Math.max(0,Math.min(a.y,b.y)/viewport.height),Math.min(1,Math.max(a.x,b.x)/viewport.width),Math.min(1,Math.max(a.y,b.y)/viewport.height)] as [number,number,number,number];setRegion({blob:await captureRegion(canvas,rect),rect});setSelectionMessage('区域已选，请确认保存摘录。')}catch(error){setSelectionMessage((error as Error).message)}}
 async function saveRegion(){if(!region)return;try{const form=new FormData();form.append('metadata',JSON.stringify({target:ink.document.target,rect:region.rect}));form.append('file',region.blob,'摘录.png');const response=await fetch(`/api/projects/${context.projectId}/ink/attachments`,{method:'POST',body:form});if(!response.ok)throw new Error('保存摘录图片失败。');const result=await response.json();setNoteLink(`/projects/${context.projectId}/notes/${result.noteId}`);setRegion(null);setSelectionMessage('摘录笔记已保存。')}catch(error){setSelectionMessage((error as Error).message)}}
 return <><div ref={container} hidden/><div className="pdf-ink-status" style={{position:'absolute',bottom:0,left:0,zIndex:5,background:'var(--panel)',fontSize:12}}><span aria-live="polite">{ink.status}{selectionMessage}</span><InkConflictActions ink={ink}/>{region&&<><button onClick={()=>void saveRegion()}>保存为摘录笔记</button><button onClick={()=>setRegion(null)}>取消摘录</button></>}{noteLink&&<a href={noteLink}>打开摘录笔记</a>}<button className="text-button" onClick={()=>history.current&&ink.change(history.current.undo())}>撤销本页手写</button><button className="text-button" onClick={()=>history.current&&ink.change(history.current.redo())}>重做本页手写</button><button className="text-button" onClick={ink.retry}>重试手写保存</button></div>{ink.ready&&!settings.hidden&&<InkCanvas key={ink.baseline} block={block} {...settings} mode={renderReady?settings.mode:'browse'} canvasWidth={viewport.width} canvasHeight={viewport.height} viewportTransform={viewport.transform} allowFingerDrawing={settings.finger} onChange={change} onTextSelect={selectText} onRegionSelect={points=>void selectRegion(points)} overlay/>}</>
}
