import type {FastifyInstance} from 'fastify'
import type Database from 'better-sqlite3'
import type {BbgddgConfig} from '../core/config.js'
import {exportAnnotatedPdf} from '../core/ink-export.js'
import {InkError} from '../core/ink.js'
import {createInkBackup,restoreInkBackup} from '../core/ink-backup.js'
export function registerExportRoutes(app:FastifyInstance,db:Database.Database,config:BbgddgConfig){
 app.post<{Params:{projectId:string}}>('/api/projects/:projectId/backups',async(request,reply)=>{try{const bytes=await createInkBackup(db,config,request.params.projectId);return reply.type('application/zip').header('Content-Disposition','attachment; filename="bbgddg-notes.zip"').send(Buffer.from(bytes))}catch(error){if(error instanceof InkError)return reply.code(error.status).send({detail:error.message});throw error}})
 app.post<{Params:{projectId:string}}>('/api/projects/:projectId/backups/restore',async(request,reply)=>{try{const file=await request.file({limits:{fileSize:100*1024*1024,files:1,fields:0}});if(!file)return reply.code(400).send({detail:'请选择备份文件。'});return await restoreInkBackup(db,config,request.params.projectId,await file.toBuffer())}catch(error){return reply.code(error instanceof InkError?error.status:400).send({detail:error instanceof InkError?error.message:'备份格式或校验不正确，未恢复数据。'})}})
 app.post<{Params:{projectId:string};Body:{kind:string;id:string}}>('/api/projects/:projectId/exports',async(request,reply)=>{
  if(request.body?.kind!=='source'||typeof request.body.id!=='string')return reply.code(400).send({detail:'请选择要导出的文献。'})
  try{const bytes=await exportAnnotatedPdf(db,config,request.params.projectId,request.body.id);return reply.type('application/pdf').header('Content-Disposition','attachment; filename="annotated.pdf"').send(Buffer.from(bytes))}catch(error){if(error instanceof InkError)return reply.code(error.status).send({detail:error.message});throw error}
 })
}
