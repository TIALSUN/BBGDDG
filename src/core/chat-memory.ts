import type { Database } from 'better-sqlite3'
import { z } from 'zod'
import { ProjectService } from './projects.js'
import { SourceService } from './sources.js'
import type { BbgddgConfig } from './config.js'
import { BbgddgError } from './types.js'

export interface ChatMemory { summary: string; enabled: boolean; throughId: number; revision: number; updatedAt: string | null }
export const memoryUpdate = z.object({ summary: z.string().max(6000), enabled: z.boolean(), revision: z.number().int().nonnegative() }).strict()
export class ChatMemoryStore {
  constructor(private db: Database, private config: BbgddgConfig) {}
  private scope(project: string, source?: string) {
    const projectId = new ProjectService(this.db).resolve(project).id
    const sourceId = source ? new SourceService(this.db, this.config).resolve(projectId, source).id : null
    return { projectId, sourceId, key: sourceId ?? '' }
  }
  get(project: string, source?: string): ChatMemory {
    const s = this.scope(project, source)
    const row = this.db.prepare('SELECT summary, enabled, through_id, revision, updated_at FROM chat_memories WHERE project_id=? AND scope_id=?').get(s.projectId, s.key) as {summary:string;enabled:number;through_id:number;revision:number;updated_at:string} | undefined
    return row ? {summary:row.summary,enabled:!!row.enabled,throughId:row.through_id,revision:row.revision,updatedAt:row.updated_at} : {summary:'',enabled:true,throughId:0,revision:0,updatedAt:null}
  }
  save(project: string, source: string | undefined, input: unknown): ChatMemory {
    const patch=memoryUpdate.parse(input), s=this.scope(project,source)
    return this.db.transaction(()=>{
      if(this.get(project,source).revision!==patch.revision)throw new BbgddgError('MEMORY_CONFLICT','记忆已更新，请重新打开后编辑。',2)
      // An explicit edit/clear replaces the older summary. Do not resurrect
      // cleared history on the next automatic compaction.
      const session=this.db.prepare('SELECT id FROM chat_sessions WHERE project_id=? AND source_id IS ? ORDER BY accessed_at DESC LIMIT 1').get(s.projectId,s.sourceId) as {id:string}|undefined
      const older=session ? this.db.prepare('SELECT id FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT -1 OFFSET 10').all(session.id) as {id:number}[] : []
      const throughId=older.length?Math.max(...older.map(r=>r.id)):0
      this.put(s.projectId,s.sourceId,patch.summary.trim(),patch.enabled,throughId,patch.revision+1)
      return this.get(project,source)
    })()
  }
  autoSave(project: string, source: string | undefined, summary: string, throughId: number, expected: number): boolean {
    const s=this.scope(project,source)
    return this.db.transaction(()=>{
      const current=this.get(project,source)
      if(current.revision!==expected||!current.enabled)return false
      this.put(s.projectId,s.sourceId,summary,true,throughId,expected+1)
      return true
    })()
  }
  private put(project:string,source:string|null,summary:string,enabled:boolean,throughId:number,revision:number){
    this.db.prepare('INSERT INTO chat_memories(project_id,scope_id,source_id,summary,enabled,through_id,revision,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_id,scope_id) DO UPDATE SET summary=excluded.summary,enabled=excluded.enabled,through_id=excluded.through_id,revision=excluded.revision,updated_at=excluded.updated_at').run(project,source??'',source,summary,Number(enabled),throughId,revision,new Date().toISOString())
  }
  clear(project:string,source?:string){const s=this.scope(project,source);this.db.prepare('DELETE FROM chat_memories WHERE project_id=? AND scope_id=?').run(s.projectId,s.key)}
}
