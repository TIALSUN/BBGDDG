import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {normalizeMath} from '../../lib/math'
import type {NoteDraft} from '../NoteWorkbench'
export default function NoteEditorBody({draft,onChange,preview}:{draft:NoteDraft;onChange:(draft:NoteDraft)=>void;preview:boolean}){
 return preview?<div className="prose note-body"><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMath(draft.content||'尚无正文，点击“编辑正文”记录自己的理解。')}</ReactMarkdown></div>:<textarea className="note-body" aria-label="笔记正文" value={draft.content} onChange={e=>onChange({...draft,content:e.target.value})} placeholder="记录自己的理解、疑问或整理 AI 解释，支持 Markdown 与公式。"/>
}
