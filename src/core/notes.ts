import { noteMetadataSchema, readNote, type NoteMetadata } from './note-links.js'
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BbgddgConfig } from './config.js'
import { ProjectService } from './projects.js'
import { SourceService } from './sources.js'
import type { Note } from './types.js'
import { BbgddgError } from './types.js'

const now = () => new Date().toISOString()

export class NoteService {
  private readonly projects: ProjectService
  private readonly sources: SourceService

  constructor(private readonly db: Database, config: BbgddgConfig) {
    this.projects = new ProjectService(db)
    this.sources = new SourceService(db, config)
  }

  list(projectSelector: string): Note[] {
    const project = this.projects.resolve(projectSelector)
    return this.db.prepare('SELECT * FROM notes WHERE project_id=? ORDER BY updated_at DESC').all(project.id).map(row=>readNote(row as Note & {metadata_json?:string})) as Note[]
  }

  listBySource(projectSelector: string, sourceSelector: string): Note[] {
    const project = this.projects.resolve(projectSelector)
    const source = this.sources.resolve(project.id, sourceSelector)
    return this.db.prepare('SELECT * FROM notes WHERE project_id=? AND source_id=? ORDER BY updated_at DESC').all(project.id, source.id).map(row=>readNote(row as Note & {metadata_json?:string})) as Note[]
  }

  resolve(projectSelector: string, selector: string): Note {
    const project = this.projects.resolve(projectSelector)
    const exact = this.db.prepare('SELECT * FROM notes WHERE project_id=? AND id=?').get(project.id, selector) as Note | undefined
    if (exact) return readNote(exact)
    const matches = this.db.prepare('SELECT * FROM notes WHERE project_id=? AND title=? COLLATE NOCASE ORDER BY created_at').all(project.id, selector) as (Note & {metadata_json?:string})[]
    if (!matches.length) throw new BbgddgError('NOTE_NOT_FOUND', `Note not found: ${selector}`, 3)
    if (matches.length > 1) throw new BbgddgError('AMBIGUOUS_NOTE', `Note title is ambiguous: ${selector}`, 4, matches.map(({ id, title }) => ({ id, title })))
    return readNote(matches[0]!)
  }

  create(projectSelector: string, options: { title?: string; content?: string; sourceSelector?: string; anchors?:NoteMetadata['anchors']; tags?:string[]; origin?:NoteMetadata['origin'] } = {}): Note {
    const project = this.projects.resolve(projectSelector)
    const source = options.sourceSelector ? this.sources.resolve(project.id, options.sourceSelector) : null
    const metadata = this.validateMetadata(project.id, options)
    const timestamp = now()
    const note: Note = {
      id: randomUUID(), project_id: project.id, source_id: source?.id ?? null,
      title: options.title?.trim() || 'Untitled Note', content: options.content ?? '',
      created_at: timestamp, updated_at: timestamp, ...metadata,
    }
    this.db.prepare(`INSERT INTO notes(id,project_id,source_id,title,content,created_at,updated_at,metadata_json)
      VALUES (@id,@project_id,@source_id,@title,@content,@created_at,@updated_at,@metadata_json)`).run({...note,metadata_json:JSON.stringify(metadata)})
    return note
  }

  private validateMetadata(projectId:string, value:unknown, existing:NoteMetadata['anchors']=[]):NoteMetadata {
    const metadata=noteMetadataSchema.parse(value)
    for(const anchor of metadata.anchors){
      if(existing.some(saved=>JSON.stringify(saved)===JSON.stringify(anchor)))continue
      const source=this.sources.resolve(projectId,anchor.sourceId)
      if(source.pages && anchor.page>source.pages)throw new BbgddgError('INVALID_ANCHOR','原文页码超出文献范围。',2)
      anchor.contentHash=source.content_hash??undefined
    }
    return metadata
  }

  /** Updates whichever of title/content is provided; the other is left unchanged. */
  update(projectSelector: string, selector: string, changes: { title?: string; content?: string; anchors?:NoteMetadata['anchors']; tags?:string[]; origin?:NoteMetadata['origin'] }): Note {
    const note = this.resolve(projectSelector, selector)
    if (changes.title !== undefined && !changes.title.trim()) throw new BbgddgError('INVALID_TITLE', 'Note title cannot be empty', 2)
    const title = changes.title !== undefined ? changes.title.trim() : note.title
    const content = changes.content !== undefined ? changes.content : note.content
    const metadata=this.validateMetadata(note.project_id,{anchors:changes.anchors??note.anchors,tags:changes.tags??note.tags,origin:changes.origin===undefined?note.origin:changes.origin},note.anchors)
    const updated_at = now()
    this.db.prepare('UPDATE notes SET title=?, content=?, updated_at=?, metadata_json=? WHERE id=?').run(title, content, updated_at, JSON.stringify(metadata), note.id)
    return { ...note, title, content, updated_at, ...metadata }
  }

  delete(projectSelector: string, selector: string): Note {
    const note = this.resolve(projectSelector, selector)
    this.db.prepare('DELETE FROM notes WHERE id=?').run(note.id)
    return note
  }
}
