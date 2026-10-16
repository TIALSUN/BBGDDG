import type { Database } from 'better-sqlite3'
import type { Passage } from './types.js'
import { cjkIndexText, cjkSearchTokens } from './cjk.js'

export function splitPages(text: string): Array<{ page: number; text: string }> {
  const matches = [...text.matchAll(/^\[Page (\d+)\]\s*$/gm)]
  if (!matches.length) return [{ page: 1, text }]
  return matches.map((match, index) => ({
    page: Number(match[1]),
    text: text.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? text.length).trim(),
  }))
}

function chunks(text: string, target = 1500, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const out: string[] = []
  for (let start = 0; start < clean.length;) {
    let end = Math.min(clean.length, start + target)
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(' ', end)
      if (boundary > start + target / 2) end = boundary
    }
    out.push(clean.slice(start, end))
    if (end === clean.length) break
    start = Math.max(start + 1, end - overlap)
  }
  return out
}

export class RetrievalService {
  constructor(private readonly db: Database) {}

  index(sourceId: string, text: string): number {
    const insert = this.db.prepare('INSERT INTO source_chunks(source_id,page_number,chunk_index,content,content_cn) VALUES (?,?,?,?,?)')
    return this.db.transaction(() => {
      this.db.prepare('DELETE FROM source_chunks WHERE source_id=?').run(sourceId)
      let count = 0
      for (const page of splitPages(text)) for (const [index, content] of chunks(page.text).entries()) {
        insert.run(sourceId, page.page, index, content, cjkIndexText(content))
        count++
      }
      return count
    })()
  }

  search(projectId: string, query: string, sourceIds: string[] = [], limit = 16): Passage[] {
    const { words, cjk } = cjkSearchTokens(query)
    const wordTerms = words.slice(0, 16)
    const cjkTerms = cjk.slice(0, 32)
    if (!wordTerms.length && !cjkTerms.length) return []
    const filter = sourceIds.length ? `AND s.id IN (${sourceIds.map(() => '?').join(',')})` : ''
    const match = (terms: string[]) => terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ')
    const select = (table: string, score: string) => `SELECT c.id, c.source_id, COALESCE(s.title,s.url,'Source') source_title,
      c.page_number, c.content, ${score} score
      FROM ${table} JOIN source_chunks c ON c.id=${table}.rowid
      JOIN sources s ON s.id=c.source_id
      WHERE ${table} MATCH ? AND s.project_id=? ${filter}`
    const candidates = new Map<number, { id: number; source_id: string; source_title: string; page_number: number; content: string; score: number }>()
    const add = (rows: Array<Record<string, unknown>>) => {
      for (const row of rows) {
        const id = Number(row.id)
        const score = Number(row.score)
        const existing = candidates.get(id)
        // FTS5 bm25 returns negative values; closer to zero is a better match.
        if (!existing || score > existing.score) candidates.set(id, { id, source_id: String(row.source_id), source_title: String(row.source_title), page_number: Number(row.page_number), content: String(row.content), score })
      }
    }
    if (wordTerms.length) add(this.db.prepare(select('source_chunks_fts', 'bm25(source_chunks_fts)')).all(match(wordTerms), projectId, ...sourceIds) as Array<Record<string, unknown>>)
    if (cjkTerms.length) add(this.db.prepare(select('source_chunks_fts_cn', 'bm25(source_chunks_fts_cn)')).all(match(cjkTerms), projectId, ...sourceIds) as Array<Record<string, unknown>>)
    const terms = [...wordTerms, ...cjkTerms]
    return [...candidates.values()]
      .map(row => ({ ...row, hits: terms.reduce((count, term) => count + (row.content.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .sort((a, b) => b.hits - a.hits || b.score - a.score)
      .slice(0, limit)
      .map(({ source_id, source_title, page_number, content, score }) => ({ source_id, source_title, page_number, content, score }))
  }
}
