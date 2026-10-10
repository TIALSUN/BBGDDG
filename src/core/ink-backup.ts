import {createHash,randomUUID} from 'node:crypto'
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate'
import {z} from 'zod'
import type Database from 'better-sqlite3'
import type {BbgddgConfig} from './config.js'
import type {InkDocument,InkBlock} from './ink-types.js'
import {InkService,InkError,inkDocumentSchema} from './ink.js'
import {validatePng} from './ink-png.js'
import {noteMetadataSchema} from './note-links.js'
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
const string=z.string().max(8*1024*1024),id=z.string().min(1).max(160),hash=z.string().regex(/^[a-f0-9]{64}$/)
const rect=z.object({x1:z.number().min(0).max(1),y1:z.number().min(0).max(1),x2:z.number().min(0).max(1),y2:z.number().min(0).max(1)})
const annotation=z.object({source_id:id,page_number:z.number().int().positive(),text:string,color:z.enum(['yellow','green','blue','pink']),note:string.nullish(),x1:z.number().min(0).max(1),y1:z.number().min(0).max(1),x2:z.number().min(0).max(1),y2:z.number().min(0).max(1),rects:z.string().nullable()})
const dataSchema=z.object({sources:z.array(z.object({id,content_hash:hash.nullable()})).max(10000),notes:z.array(z.object({id,source_id:id.nullable(),title:z.string().max(10000),content:string,metadata_json:string})).max(10000),ink:z.array(inkDocumentSchema).max(10000),annotations:z.array(annotation).max(10000)})
const manifestSchema=z.object({version:z.literal(1),files:z.record(z.string(),hash)}).strict()
export async function createInkBackup(db:Database.Database,_config:BbgddgConfig,projectId:string):Promise<Uint8Array>{
 if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))throw new InkError(404,'找不到项目。')
 const files:Record<string,Uint8Array>={}
 const data={sources:db.prepare('SELECT id,content_hash FROM sources WHERE project_id=?').all(projectId),notes:db.prepare('SELECT id,source_id,title,content,metadata_json FROM notes WHERE project_id=?').all(projectId),ink:(db.prepare('SELECT body FROM ink_documents WHERE project_id=?').all(projectId) as {body:string}[]).map(row=>JSON.parse(row.body)),annotations:db.prepare('SELECT source_id,page_number,text,color,note,x1,y1,x2,y2,rects FROM annotations WHERE project_id=?').all(projectId)}
 files['data.json']=strToU8(JSON.stringify(data));if(files['data.json'].length>32*1024*1024)throw new InkError(413,'笔记与标注 JSON 超过 32 MiB，请拆分项目。')
 for(const row of db.prepare('SELECT id,bytes FROM ink_attachments WHERE project_id=?').all(projectId) as {id:string;bytes:Buffer}[])files[`images/${row.id}.png`]=row.bytes
 files['manifest.json']=strToU8(JSON.stringify({version:1,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,digest(bytes)]))}))
 const result=zipSync(files,{level:0});if(result.length>100*1024*1024)throw new InkError(413,'备份超过 100 MiB，请拆分项目。');return result
}
function extract(archive:Uint8Array){
 if(archive.length>100*1024*1024)throw new InkError(413,'备份超过 100 MiB。')
 const bytes=Buffer.from(archive),end=bytes.length-22
 if(end<0||bytes.readUInt32LE(end)!==0x06054b50||bytes.readUInt16LE(end+20)!==0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw new InkError(400,'不支持此备份容器。')
 let central=bytes.readUInt32LE(end+16)
 const centralEnd=central+bytes.readUInt32LE(end+12)
 if(centralEnd!==end)throw new InkError(400,'备份目录不完整。')
 for(let i=0;i<bytes.readUInt16LE(end+10);i++){if(central+46>centralEnd||bytes.readUInt32LE(central)!==0x02014b50||((bytes.readUInt32LE(central+38)>>>16)&0xf000)===0xa000||(bytes.readUInt16LE(central+8)&1))throw new InkError(400,'备份包含符号链接、加密或无效目录。');central+=46+bytes.readUInt16LE(central+28)+bytes.readUInt16LE(central+30)+bytes.readUInt16LE(central+32)}
 if(central!==centralEnd)throw new InkError(400,'备份目录条目不一致。')
 let size=0,count=0
 const seen=new Set<string>()
 const files=unzipSync(archive,{filter:file=>{if(seen.has(file.name))throw new InkError(400,'备份包含重复条目。');seen.add(file.name);count++;size+=file.originalSize;if(file.compression!==0||count>10000||size>200*1024*1024||file.originalSize>32*1024*1024||!(/^(manifest\.json|data\.json|images\/[a-zA-Z0-9-]+\.png)$/).test(file.name))throw new InkError(400,'备份包含不支持的压缩、路径或超限内容。请使用本应用导出的备份。');return true}})
 
 const manifest=manifestSchema.parse(JSON.parse(strFromU8(files['manifest.json']||new Uint8Array())))
 if(Object.keys(files).length!==Object.keys(manifest.files).length+1)throw new InkError(400,'备份文件清单不完整。')
 for(const [name,checksum] of Object.entries(manifest.files))if(!files[name]||digest(files[name])!==checksum)throw new InkError(400,'备份校验失败，未恢复任何数据。')
 const data=dataSchema.parse(JSON.parse(strFromU8(files['data.json']||new Uint8Array())))
 for(const note of data.notes)noteMetadataSchema.parse(JSON.parse(note.metadata_json))
 for(const item of data.annotations)if(item.rects)z.array(rect).max(10000).parse(JSON.parse(item.rects))
 for(const [name,bytes] of Object.entries(files))if(name.startsWith('images/'))validatePng(Buffer.from(bytes))
 for(const document of data.ink)for(const block of document.blocks)for(const image of block.images||[])if(!files[`images/${image.attachmentId}.png`])throw new InkError(400,'备份缺少引用图片。')
 return {data,files,archiveDigest:digest(JSON.stringify(Object.entries(manifest.files).sort()))}
}
function noteCoordinates(blocks:InkBlock[]):InkBlock[]{return blocks.map(block=>{const points=block.strokes.flatMap(s=>s.points);if(!points.length)return block;const bounds=points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}),scale=Math.min(900/Math.max(1,bounds.maxX-bounds.minX),99900/Math.max(1,bounds.maxY-bounds.minY));return {...block,height:Math.max(100,Math.min(100000,(bounds.maxY-bounds.minY)*scale+100)),strokes:block.strokes.map(stroke=>({...stroke,width:Math.max(.5,Math.min(32,stroke.width*scale)),points:stroke.points.map(p=>({...p,x:(p.x-bounds.minX)*scale+50,y:(bounds.maxY-p.y)*scale+50}))}))}})}
export async function restoreInkBackup(db:Database.Database,_config:BbgddgConfig,projectId:string,archive:Uint8Array):Promise<{created:number;duplicates:number;missingSources:number}>{
 const {data,files,archiveDigest}=extract(archive)
 if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))throw new InkError(404,'找不到恢复目标项目。')
 return db.transaction(()=>{
  const previous=db.prepare("SELECT id FROM notes WHERE project_id=? AND json_extract(metadata_json,'$.backupDigest')=?").get(projectId,archiveDigest)
  if(previous)return {created:0,duplicates:data.notes.length+data.ink.length+data.annotations.length,missingSources:0}
  let created=0,duplicates=0,missingSources=0
  const sourceMap=new Map<string,string>(),noteMap=new Map<string,string>(),attachmentMap=new Map<string,string>(),ink=new InkService(db),time=new Date().toISOString()
  for(const source of data.sources){const match=source.content_hash?db.prepare('SELECT id FROM sources WHERE project_id=? AND content_hash=?').get(projectId,source.content_hash) as {id:string}|undefined:undefined;if(match)sourceMap.set(source.id,match.id);else missingSources++}
  function createNote(title:string,content:string,metadata:Record<string,unknown>,sourceId:string|null=null){const noteId=randomUUID();db.prepare('INSERT INTO notes(id,project_id,source_id,title,content,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(noteId,projectId,sourceId,title,content,JSON.stringify(metadata),time,time);created++;return noteId}
  for(const [name,bytes] of Object.entries(files))if(name.startsWith('images/')){const oldId=name.slice(7,-4),newId=randomUUID();attachmentMap.set(oldId,newId);db.prepare('INSERT INTO ink_attachments(id,project_id,metadata,bytes) VALUES(?,?,?,?)').run(newId,projectId,JSON.stringify({id:newId,mime:'image/png',...validatePng(Buffer.from(bytes)),restored:true}),Buffer.from(bytes))}
  for(const note of data.notes){const metadata=noteMetadataSchema.parse(JSON.parse(note.metadata_json));metadata.anchors=metadata.anchors.map(anchor=>({...anchor,sourceId:sourceMap.get(anchor.sourceId)||anchor.sourceId}));const fingerprint=digest(JSON.stringify(note)),existing=db.prepare("SELECT id FROM notes WHERE project_id=? AND json_extract(metadata_json,'$.backupItemDigest')=?").get(projectId,fingerprint) as {id:string}|undefined;if(existing){noteMap.set(note.id,existing.id);duplicates++;continue}noteMap.set(note.id,createNote(note.title,note.content,{...metadata,backupItemDigest:fingerprint},note.source_id?sourceMap.get(note.source_id)||null:null))}
  for(const document of data.ink){const target=document.target;let nextTarget:InkDocument['target'];let blocks:InkBlock[]=structuredClone(document.blocks)
   for(const block of blocks)for(const image of block.images||[])image.attachmentId=attachmentMap.get(image.attachmentId)!
   if(target.kind==='note'){const noteId=noteMap.get(target.noteId);if(!noteId)throw new InkError(400,'手写引用了缺失的笔记。');nextTarget={kind:'note',noteId}}
   else {const sourceId=sourceMap.get(target.sourceId);if(sourceId){nextTarget={...target,sourceId};const current=ink.get(projectId,nextTarget);if(current.blocks.length){if(JSON.stringify(current.blocks)===JSON.stringify(blocks)){duplicates++;continue}const noteId=createNote(`恢复的第 ${target.page} 页手写`,'原文已有另一版手写，此处保留恢复副本。',{anchors:[{sourceId,page:target.page,text:'恢复手写',rects:[],contentHash:target.contentHash}],tags:['恢复副本']});nextTarget={kind:'note',noteId};blocks=noteCoordinates(blocks)}}else{const noteId=createNote(`恢复的第 ${target.page} 页手写（原文缺失）`,`原文 ID：${target.sourceId}\n\n内容摘要：${target.contentHash}\n\n请重新导入原文后核对。`,{anchors:[],tags:['原文缺失']});nextTarget={kind:'note',noteId};blocks=noteCoordinates(blocks)}}
   let current=ink.get(projectId,nextTarget);if(current.blocks.length){if(JSON.stringify(current.blocks)===JSON.stringify(blocks)){duplicates++;continue}const noteId=createNote('恢复的笔记手写副本','已有另一版笔迹，原笔记与笔迹均已保留。',{anchors:[],tags:['恢复副本']});nextTarget={kind:'note',noteId};current=ink.get(projectId,nextTarget)}ink.save(projectId,{...document,revision:current.revision,target:nextTarget,blocks},current.revision);created++
  }
  for(const item of data.annotations){const sourceId=sourceMap.get(item.source_id);if(!sourceId){createNote(`恢复的第 ${item.page_number} 页标注（原文缺失）`,`${item.text}\n\n${item.note||''}\n\n原文 ID：${item.source_id}`,{anchors:[],tags:['原文缺失']});continue}db.prepare('INSERT INTO annotations(id,project_id,source_id,page_number,x1,y1,x2,y2,text,color,note,rects,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),projectId,sourceId,item.page_number,item.x1,item.y1,item.x2,item.y2,item.text,item.color,item.note||'',item.rects,time);created++}
  createNote('备份恢复记录',`恢复 ${created} 项；重复 ${duplicates} 项；缺少原文 ${missingSources} 份。`,{anchors:[],tags:['恢复记录'],backupDigest:archiveDigest})
  return {created,duplicates,missingSources}
 })()
}
