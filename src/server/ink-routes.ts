import type {FastifyInstance} from 'fastify'
import type Database from 'better-sqlite3'
import {InkService,InkError,inkTargetSchema} from '../core/ink.js'
export function registerInkRoutes(app:FastifyInstance,db:Database.Database){
 const service=new InkService(db)
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
