import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type {Note} from '../lib/api'
import type {InkDocument} from '../../../src/core/ink-types'
import {normalizeMath} from '../lib/math'
export type ResolvedAttachment={id:string;url:string;width:number;height:number}
export async function printNote(note:Note,ink:InkDocument,attachments:ResolvedAttachment[]):Promise<void>{
 const frame=document.createElement('iframe');frame.title='笔记打印预览';frame.style.cssText='position:fixed;left:-10000px;width:800px;height:1000px';document.body.append(frame)
 const doc=frame.contentDocument!,win=frame.contentWindow!
 const style=doc.createElement('style');style.textContent='@page{size:A4;margin:18mm}body{background:#fff!important;color:#111!important;font:12pt/1.6 sans-serif;margin:0}h1{font-size:22pt}.ink-paper{break-inside:avoid;margin:12mm 0}.ink-paper svg{display:block;width:100%;height:auto;max-height:255mm}img{max-width:100%}pre{white-space:pre-wrap}a{color:#111}';doc.head.append(style)
 for(const node of document.querySelectorAll('link[rel="stylesheet"]'))doc.head.append(node.cloneNode(true))
 const target=doc.createElement('main');doc.body.append(target);const root=createRoot(target)
 flushSync(()=>root.render(<><h1>{note.title}</h1><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMath(note.content||'')}</ReactMarkdown>{(note.anchors||[]).map((anchor,i)=><p key={i}>来源：第 {anchor.page} 页 · {anchor.text}</p>)}{ink.blocks.map(block=><div className="ink-paper" key={block.id}><svg viewBox={`0 0 1000 ${block.height}`} xmlns="http://www.w3.org/2000/svg">{block.background!=='blank'&&<><defs><pattern id={`print-${block.id}`} width="40" height="40" patternUnits="userSpaceOnUse"><path d={block.background==='grid'?'M40 0H0V40':'M0 40H40'} stroke="#dce2ec" fill="none"/></pattern></defs><rect width="1000" height={block.height} fill={`url(#print-${block.id})`}/></>}{(block.images||[]).map(image=><image key={image.id} href={attachments.find(a=>a.id===image.attachmentId)?.url} x={image.x} y={image.y} width={image.width} height={image.height}/>)}{block.strokes.map(stroke=><polyline key={stroke.id} points={(stroke.tool==='line'?[stroke.points[0],stroke.points.at(-1)!]:stroke.points).map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width*(stroke.tool==='marker'?5:1)} opacity={stroke.tool==='marker'?.32:1} strokeLinecap="round" strokeLinejoin="round"/>)}</svg></div>)}</>))
 try{
  await doc.fonts.ready
  await Promise.all(attachments.map(attachment=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error('摘录图片加载失败，请重试。'));image.src=attachment.url})))
  await new Promise<void>(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(()=>resolve())))
  win.addEventListener('afterprint',()=>{root.unmount();frame.remove()},{once:true});win.focus();win.print()
 }catch(error){root.unmount();frame.remove();throw error}
}
