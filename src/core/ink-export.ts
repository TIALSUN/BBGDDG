import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import type Database from 'better-sqlite3'
import {PDFDocument,rgb,LineCapStyle} from 'pdf-lib'
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs'
import type {BbgddgConfig} from './config.js'
import type {InkDocument} from './ink-types.js'
import {InkError} from './ink.js'
const color=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255)
export async function exportAnnotatedPdf(db:Database.Database,config:BbgddgConfig,projectId:string,sourceId:string):Promise<Uint8Array>{
 const source=db.prepare('SELECT local_path,content_hash FROM sources WHERE id=? AND project_id=? AND type=?').get(sourceId,projectId,'pdf') as {local_path:string;content_hash:string}|undefined
 if(!source?.local_path)throw new InkError(404,'找不到 PDF 原文。')
 const bytes=fs.readFileSync(path.join(config.filesDir,path.basename(source.local_path)))
 if(createHash('sha256').update(bytes).digest('hex')!==source.content_hash)throw new InkError(409,'原文已变化，请重新导入后核对标注。')
 const output=await PDFDocument.load(bytes),pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise
 try{
  const documents=db.prepare('SELECT body FROM ink_documents WHERE project_id=? AND source_id=?').all(projectId,sourceId) as {body:string}[]
  for(const {body} of documents){const document:InkDocument=JSON.parse(body);if(document.target.kind!=='pdf')continue;if(document.target.contentHash!==source.content_hash)throw new InkError(409,'存在与当前原文不匹配的笔迹，请先核对。');const page=output.getPage(document.target.page-1)
   for(const block of document.blocks)for(const stroke of block.strokes){const points=stroke.tool==='line'?[stroke.points[0]!,stroke.points.at(-1)!]:stroke.points,opacity=stroke.tool==='marker'?.32:1,width=stroke.width*(stroke.tool==='marker'?5:1)
    if(points.length===1){page.drawCircle({x:points[0]!.x,y:points[0]!.y,size:width/2,color:color(stroke.color),opacity});continue}
    const pathData=points.map((p,i)=>`${i?'L':'M'} ${p.x} ${-p.y}`).join(' ')
    page.drawSvgPath(pathData,{x:0,y:0,borderColor:color(stroke.color),borderWidth:width,borderOpacity:opacity,borderLineCap:LineCapStyle.Round})
   }
  }
  const annotations=db.prepare('SELECT * FROM annotations WHERE project_id=? AND source_id=?').all(projectId,sourceId) as {page_number:number;x1:number;y1:number;x2:number;y2:number;rects:string|null;color:string}[]
  for(const annotation of annotations){const page=output.getPage(annotation.page_number-1),viewport=(await pdf.getPage(annotation.page_number)).getViewport({scale:1});const rects=annotation.rects?JSON.parse(annotation.rects):[annotation]
   for(const rect of rects){const a=viewport.convertToPdfPoint(rect.x1*viewport.width,rect.y1*viewport.height),b=viewport.convertToPdfPoint(rect.x2*viewport.width,rect.y2*viewport.height);page.drawRectangle({x:Math.min(a[0]!,b[0]!),y:Math.min(a[1]!,b[1]!),width:Math.abs(a[0]!-b[0]!),height:Math.abs(a[1]!-b[1]!),color:color(({yellow:'#fde047',green:'#4ade80',blue:'#60a5fa',pink:'#f472b6'} as Record<string,string>)[annotation.color]||'#fde047'),opacity:.4})}
  }
  return await output.save()
 }finally{await pdf.destroy()}
}
