import { useEffect, useRef, useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type PdfViewer from './PdfViewer'

export default function TextDocumentViewer(props: ComponentProps<typeof PdfViewer>) {
  const container = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{page:number;text:string;rects:[]}[]>([])
  const [position, setPosition] = useState(props.initialPage || 1)
  const paragraphs = [...(props.text || '').matchAll(/^\[Page (\d+)\]\s*\n([\s\S]*?)(?=^\[Page \d+\]\s*$|$(?![\s\S]))/gm)]
  function jump(page: number) {
    container.current?.querySelector(`[data-paragraph="${page}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setPosition(page); props.onPageChange?.(page)
  }
  useEffect(() => { if (props.pageRequest) jump(props.pageRequest.page) }, [props.pageRequest?.key])
  useEffect(() => { if (props.initialPage && props.initialPage > 1) jump(props.initialPage) }, [])
  function selected() {
    const current = window.getSelection()
    if (!current || current.isCollapsed || !current.rangeCount || !container.current?.contains(current.anchorNode)) return
    const range = current.getRangeAt(0)
    const anchors = [...container.current.querySelectorAll<HTMLElement>('.text-document-content')].filter(node => range.intersectsNode(node))
      .map(node => {
        const clipped=range.cloneRange()
        if(!node.contains(range.startContainer))clipped.setStart(node,0)
        if(!node.contains(range.endContainer))clipped.setEnd(node,node.childNodes.length)
        return {page:Number(node.parentElement!.dataset.paragraph),text:clipped.toString().trim().slice(0,20000),rects:[] as []}
      }).filter(anchor=>anchor.text)
    setSelection(anchors)
  }
  return <div className="text-document-viewer" ref={container} onMouseUp={selected} onKeyUp={selected}>
    <div className="text-document-toolbar"><label>定位段落 <input aria-label="定位段落" type="number" min="1" max={props.pages} value={position} onChange={e => {const n=Number(e.target.value);if(n>=1&&n<=props.pages)jump(n)}}/></label>
      <span>共 {props.pages} 段</span><a href={props.url} download>下载原文件</a></div>
    {selection.length>0&&<div className="text-selection-actions"><button onClick={()=>{props.onTextSelected?.(selection.map(a=>a.text).join('\n\n'),selection);setSelection([])}}>向 AI 提问</button><button onClick={()=>{props.onAnchoredNote?.(selection);setSelection([])}}>添加原文笔记</button></div>}
    {paragraphs.map(match=><article key={match[1]} data-paragraph={match[1]} className={props.pageRequest?.page===Number(match[1])?'text-paragraph is-target':'text-paragraph'} onClick={()=>{setPosition(Number(match[1]));props.onPageChange?.(Number(match[1]))}}>
      <small aria-hidden="true">第 {match[1]} 段</small><div className="text-document-content">{props.markdown?<ReactMarkdown remarkPlugins={[remarkGfm]}>{match[2]}</ReactMarkdown>:<p style={{whiteSpace:'pre-wrap'}}>{match[2]}</p>}</div>
    </article>)}
  </div>
}
