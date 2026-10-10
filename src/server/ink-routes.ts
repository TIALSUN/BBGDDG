import type {FastifyInstance} from 'fastify'
import type Database from 'better-sqlite3'
import {createInkExcerpt} from '../core/ink-excerpt.js'
import {InkService,InkError,inkTargetSchema} from '../core/ink.js'
export function registerInkRoutes(app:FastifyInstance,db:Database.Database){
 const service=new InkService(db)
 app.get<{Params:{projectId:string}}>('/api/projects/:projectId/ink/documents',async(request,reply)=>{if(!db.prepare('SELECT id FROM projects WHERE id=?').get(request.params.projectId))return reply.code(404).send({detail:'找不到项目。'});return (db.prepare('SELECT body FROM ink_documents WHERE project_id=?').all(request.params.projectId) as {body:string}[]).map(row=>JSON.parse(row.body))})
 app.post<{Params:{projectId:string}}>('/api/projects/:projectId/ink/attachments',async(request,reply)=>{
  try{
   const file=await request.file({limits:{fileSize:5*1024*1024,files:1,fields:1}})
   if(!file||file.mimetype!=='image/png')return reply.code(400).send({detail:'请选择 PNG 图片。'})
   const bytes=await file.toBuffer(),field=file.fields.metadata
   if(!field||Array.isArray(field)||field.type!=='field')return reply.code(400).send({detail:'缺少来源信息。'})
   const metadata=JSON.parse(String(field.value)),target=inkTargetSchema.parse(metadata.target)
   if(target.kind!=='pdf')return reply.code(400).send({detail:'区域摘录需要 PDF 来源。'})
   service.assertTarget(request.params.projectId,target)
   const rect=metadata.rect
   if(!Array.isArray(rect)||rect.length!==4||rect.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)||rect[0]>=rect[2]||rect[1]>=rect[3])return reply.code(400).send({detail:'摘录范围无效。'})
   return createInkExcerpt(db,request.params.projectId,target,rect,bytes)
  }catch(error){return reply.code(error instanceof InkError?error.status:400).send({detail:error instanceof Error?error.message:'摘录保存失败。'})}
 })
 app.get<{Params:{projectId:string;id:string}}>('/api/projects/:projectId/ink/attachments/:id',async(request,reply)=>{
  const row=db.prepare('SELECT bytes FROM ink_attachments WHERE id=? AND project_id=?').get(request.params.id,request.params.projectId) as {bytes:Buffer}|undefined
  if(!row)return reply.code(404).send({detail:'找不到这张摘录。'})
  return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').type('image/png').send(row.bytes)
 })
 app.get<{Params:{projectId:string};Querystring:{kind:string;sourceId?:string;page?:string;contentHash?:string;noteId?:string}}>('/api/projects/:projectId/ink',async(request,reply)=>{
  const q=request.query
  const target=inkTargetSchema.safeParse(q.kind==='note'?{kind:q.kind,noteId:q.noteId}:{kind:q.kind,sourceId:q.sourceId,page:Number(q.page),contentHash:q.contentHash})
  if(!target.success)return reply.code(400).send({detail:'手写目标不正确。'})
  try{return service.get(request.params.projectId,target.data)}catch(error){if(error instanceof InkError)return reply.code(error.status).send({detail:error.message});throw error}
 })
 app.put<{Params:{projectId:string};Body:{document:unknown;expectedRevision:number}}>('/api/projects/:projectId/ink',{bodyLimit:8*1024*1024},async(request,reply)=>{
  try{return service.save(request.params.projectId,request.body?.document,request.body?.expectedRevision)}catch(error){if(error instanceof InkError)return reply.code(error.status).send({detail:error.message});throw error}
 })
}
