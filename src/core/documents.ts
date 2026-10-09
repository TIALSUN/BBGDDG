import path from 'node:path'
import { unzipSync } from 'fflate'
import { load } from 'cheerio'
import { BbgddgError } from './types.js'

export const DOCUMENT_LIMIT = 25 * 1024 * 1024
export function extractDocument(bytes: Buffer, filename: string) {
  if (bytes.length > DOCUMENT_LIMIT) throw new BbgddgError('FILE_TOO_LARGE', '文件不能超过 25 MB。', 2)
  const extension = path.extname(filename).toLowerCase()
  let text: string
  if (extension === '.docx') {
    try {
      const entries = unzipSync(bytes, { filter: entry => {
        if (entry.name !== 'word/document.xml') return false
        if (entry.originalSize > 8 * 1024 * 1024) throw new Error('Document XML too large')
        return true
      } })
      const xml = entries['word/document.xml']
      if (!xml) throw new Error('Missing Word document')
      const $ = load(new TextDecoder('utf-8', { fatal: true }).decode(xml), { xmlMode: true })
      text = $('w\\:p').map((_, p) => {
        const style = $(p).find('w\\:pStyle').attr('w:val') || ''
        const heading = style.match(/^Heading([1-6])$/i)
        const content = $(p).find('w\\:t,w\\:tab,w\\:br').map((_, node) => node.tagName === 'w:tab' ? '\t' : node.tagName === 'w:br' ? '\n' : $(node).text()).get().join('')
        return (heading ? '#'.repeat(Number(heading[1])) + ' ' : '') + content
      }).get().join('\n\n')
    } catch { throw new BbgddgError('INVALID_DOCX', '无法读取 DOCX，请确认文件完整、未加密；旧版 DOC 请另存为 DOCX。', 2) }
  } else if (extension === '.md' || extension === '.txt') {
    try {
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
      text = new TextDecoder(encoding, { fatal: true }).decode(bytes)
      if (text.includes('\0')) throw new Error('Binary input')
    } catch { throw new BbgddgError('INVALID_TEXT', '无法读取文字文件，请保存为 UTF-8 或带 BOM 的 UTF-16 编码。', 2) }
  } else throw new BbgddgError('UNSUPPORTED_FORMAT', '支持 PDF、MD、TXT 和 DOCX；其他格式请先转换。', 2)
  const normalized = text.replace(/\r\n?/g, '\n').trim().replace(/^\[Page (\d+)\]\s*$/gm, '\u200b[Page $1]')
  const paragraphs: string[] = []
  let block: string[] = [], fence = ''
  for (const line of normalized.split('\n')) {
    const marker = extension === '.md' ? line.match(/^\s*(`{3,}|~{3,})/)?.[1] : undefined
    if (marker) { if (!fence) fence = marker[0]!; else if (marker[0] === fence) fence = '' }
    if (!line.trim() && !fence) { if (block.length) paragraphs.push(block.join('\n').trim()); block = [] }
    else block.push(line)
  }
  if (block.length) paragraphs.push(block.join('\n').trim())
  if (!paragraphs.length) throw new BbgddgError('EMPTY_DOCUMENT', '文档没有可读取的文字。', 2)
  if (paragraphs.length > 20000 || text.length > 4 * 1024 * 1024) throw new BbgddgError('DOCUMENT_TOO_LARGE', '文档文字过多，请拆分后导入。', 2)
  return { text: paragraphs.map((p, i) => `[Page ${i + 1}]\n${p}`).join('\n\n'), pages: paragraphs.length,
    mediaType: extension === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : extension === '.md' ? 'text/markdown' : 'text/plain' }
}
