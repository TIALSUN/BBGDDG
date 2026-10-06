import { z } from 'zod'

const rect = z.object({x1:z.number().min(0).max(1),y1:z.number().min(0).max(1),x2:z.number().min(0).max(1),y2:z.number().min(0).max(1)})
  .refine(r=>r.x2>r.x1&&r.y2>r.y1,'Invalid rectangle')
export const noteAnchorSchema = z.object({
  sourceId:z.string().min(1), page:z.number().int().positive(), text:z.string().max(20000),
  contentHash:z.string().max(128).optional(), rects:z.array(rect).max(500).default([]),
})
export const noteMetadataSchema = z.object({
  anchors:z.array(noteAnchorSchema).max(100).default([]),
  tags:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  origin:z.object({kind:z.literal('ai'),content:z.string().max(200000),createdAt:z.string().max(80)}).nullable().default(null),
})
export type NoteAnchor = z.infer<typeof noteAnchorSchema>
export type NoteMetadata = z.infer<typeof noteMetadataSchema>
export function readNote<T extends object>(row:T):Omit<T,'metadata_json'> & NoteMetadata {
  const {metadata_json,...note}=row as T & {metadata_json?:string}
  return {...note,...noteMetadataSchema.parse(JSON.parse(metadata_json??'{}'))}
}
