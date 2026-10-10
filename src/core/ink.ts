import {z} from 'zod'
import type Database from 'better-sqlite3'
import type {InkDocument,InkTarget} from './ink-types.js'
import {inkColors} from './ink-types.js'
export class InkError extends Error{constructor(public status:number,message:string){super(message)}}
const id=z.string().min(1).max(160)
const finite=z.number().finite().min(-100000).max(100000)
export const inkTargetSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('pdf'),sourceId:id,page:z.number().int().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('note'),noteId:id}).strict()
])
const point=z.object({x:finite,y:finite,pressure:z.number().min(0).max(1).optional()}).strict()
const stroke=z.object({id,tool:z.enum(['pen','marker','line']),color:z.enum(inkColors),width:z.number().min(.5).max(32),points:z.array(point).min(1).max(20000)}).strict()
const image=z.object({id,attachmentId:id,x:finite,y:finite,width:z.number().positive().max(100000),height:z.number().positive().max(100000)}).strict()
export const inkDocumentSchema=z.object({version:z.literal(1),revision:z.number().int().min(0),target:inkTargetSchema,blocks:z.array(z.object({id,height:z.number().positive().max(100000),background:z.enum(['blank','ruled','grid']),strokes:z.array(stroke).max(10000),images:z.array(image).max(1000).optional()}).strict()).max(200)}).strict()
export function inkTargetKey(target:InkTarget){return target.kind==='note'?`note:${target.noteId}`:`pdf:${target.sourceId}:${target.page}:${target.contentHash}`}
export function inkAttachmentIds(db:Database.Database,projectId:string,targetId:string){const ids=new Set<string>();for(const row of db.prepare('SELECT body FROM ink_documents WHERE project_id=? AND (note_id=? OR source_id=? OR note_id IN(SELECT id FROM notes WHERE project_id=? AND source_id=?))').all(projectId,targetId,targetId,projectId,targetId) as {body:string}[]){const document:InkDocument=JSON.parse(row.body);for(const block of document.blocks)for(const image of block.images||[])ids.add(image.attachmentId)}return [...ids]}
export function pruneInkAttachments(db:Database.Database,projectId:string,ids:string[]){const statement=db.prepare(`DELETE FROM ink_attachments WHERE project_id=? AND id=? AND NOT EXISTS(SELECT 1 FROM ink_documents d,json_each(d.body,'$.blocks') b,json_each(b.value,'$.images') i WHERE d.project_id=? AND json_extract(i.value,'$.attachmentId')=ink_attachments.id)`);for(const id of ids)statement.run(projectId,id,projectId)}
export class InkService{
 constructor(public db:Database.Database){}
 assertTarget(projectId:string,target:InkTarget){
  if(target.kind==='note'){
   if(!this.db.prepare('SELECT id FROM notes WHERE project_id=? AND id=?').get(projectId,target.noteId))throw new InkError(404,'找不到这篇笔记。')
  }else{
   const source=this.db.prepare('SELECT pages,content_hash FROM sources WHERE project_id=? AND id=? AND type=?').get(projectId,target.sourceId,'pdf') as {pages:number;content_hash:string}|undefined
   if(!source||target.page>source.pages)throw new InkError(404,'找不到这一页文献。')
   if(source.content_hash!==target.contentHash)throw new InkError(409,'文献内容已变化，旧笔迹无法自动套用。')
  }
 }
 get(projectId:string,target:InkTarget):InkDocument{
  this.assertTarget(projectId,target)
  const row=this.db.prepare('SELECT body,revision FROM ink_documents WHERE project_id=? AND target_key=?').get(projectId,inkTargetKey(target)) as {body:string;revision:number}|undefined
  return row?{...JSON.parse(row.body),revision:row.revision}:{version:1,revision:0,target,blocks:[]}
 }
 save(projectId:string,input:unknown,expectedRevision:number):InkDocument{
  if(Buffer.byteLength(JSON.stringify(input)||'')>8*1024*1024)throw new InkError(413,'手写内容超过 8 MiB，草稿需保留并拆分。')
  const parsed=inkDocumentSchema.safeParse(input)
  if(!parsed.success||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new InkError(400,'手写数据格式不正确。')
  const document=parsed.data
  if(document.blocks.reduce((sum,b)=>sum+b.strokes.length,0)>10000)throw new InkError(413,'笔画数量超过上限。')
  const ids=new Set<string>()
  for(const block of document.blocks){for(const item of [block,...block.strokes,...(block.images||[])]){if(ids.has(item.id))throw new InkError(400,'手写内容包含重复标识。');ids.add(item.id)}}
  return this.db.transaction(()=>{
   const current=this.get(projectId,document.target)
   if(current.revision!==expectedRevision||document.revision!==expectedRevision)throw new InkError(409,'手写已在其他窗口更新，本机草稿已保留。')
   for(const block of document.blocks)for(const image of block.images||[]){if(!this.db.prepare('SELECT id FROM ink_attachments WHERE id=? AND project_id=?').get(image.attachmentId,projectId))throw new InkError(404,'找不到引用图片。')}
   const next:InkDocument={...document,revision:current.revision+1}
   this.db.prepare(`INSERT INTO ink_documents(project_id,target_key,source_id,note_id,revision,body) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,target_key) DO UPDATE SET revision=excluded.revision,body=excluded.body`).run(projectId,inkTargetKey(document.target),document.target.kind==='pdf'?document.target.sourceId:null,document.target.kind==='note'?document.target.noteId:null,next.revision,JSON.stringify(next))
   pruneInkAttachments(this.db,projectId,current.blocks.flatMap(block=>(block.images||[]).map(image=>image.attachmentId)))
   return next
  })()
 }
}
