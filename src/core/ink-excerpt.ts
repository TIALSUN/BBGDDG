import {randomUUID} from 'node:crypto'
import type Database from 'better-sqlite3'
import {InkService,InkError} from './ink.js'
import {validatePng} from './ink-png.js'
import type {InkTarget} from './ink-types.js'

export function createInkExcerpt(db:Database.Database,projectId:string,target:InkTarget,rect:number[],bytes:Buffer){
 if(target.kind!=='pdf'||rect.length!==4||rect.some(n=>!Number.isFinite(n)||n<0||n>1)||rect[0]!>=rect[2]!||rect[1]!>=rect[3]!)throw new InkError(400,'摘录范围无效。')
 const dimensions=validatePng(bytes),service=new InkService(db)
 return db.transaction(()=>{
  service.assertTarget(projectId,target)
  const id=randomUUID(),noteId=randomUUID(),time=new Date().toISOString(),height=1000*dimensions.height/dimensions.width
  if(height>100000)throw new InkError(400,'摘录比例超限。')
  const result={id,noteId,mime:'image/png',...dimensions,sourceId:target.sourceId,page:target.page,contentHash:target.contentHash,rect}
  db.prepare('INSERT INTO ink_attachments(id,project_id,metadata,bytes) VALUES(?,?,?,?)').run(id,projectId,JSON.stringify(result),bytes)
  const metadata={anchors:[{sourceId:target.sourceId,page:target.page,contentHash:target.contentHash,text:'区域摘录',rects:[{x1:rect[0],y1:rect[1],x2:rect[2],y2:rect[3]}]}],tags:[]}
  db.prepare('INSERT INTO notes(id,project_id,source_id,title,content,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(noteId,projectId,target.sourceId,`第 ${target.page} 页区域摘录`,'',JSON.stringify(metadata),time,time)
  service.save(projectId,{version:1,revision:0,target:{kind:'note',noteId},blocks:[{id:randomUUID(),height:Math.max(1,height),background:'blank',strokes:[],images:[{id:randomUUID(),attachmentId:id,x:0,y:0,width:1000,height}]}]},0)
  return result
 })()
}
