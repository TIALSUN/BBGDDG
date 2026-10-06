import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { Annotation } from '../lib/api'
import {ColorPicker} from './WorkspaceUI'

// Bundle the worker from the same pdfjs-dist version used by react-pdf.
// package.json pins pdfjs-dist to react-pdf's exact version (no "^"): pdfjs
// throws if the API and worker versions differ, and a caret range lets npm
// hoist a newer pdfjs-dist here than the one react-pdf bundles internally,
// silently breaking every render with "Failed to render page".
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type PageRect = { x1: number; y1: number; x2: number; y2: number }

interface Props {
  url: string
  pages: number
  initialPage?: number
  pageRequest?: {page:number;key:number;excerpt?:string;rects?:PageRect[]}
  isResizing?: boolean
  onPageChange?: (page: number) => void
  onTextSelected?: (text: string, anchors?:{page:number;text:string;rects:PageRect[]}[]) => void
  onAnchoredNote?: (anchors:{page:number;text:string;rects:PageRect[]}[])=>void
  annotations?: Annotation[]
  onHighlightCreate?: (data: { page_number: number; x1: number; y1: number; x2: number; y2: number; rects: PageRect[]; text: string; color: string }) => void
  onHighlightClick?: (annotation: Annotation) => void
  onHighlightDelete?: (id:string)=>Promise<void>
  onNoteCreate?: Props['onHighlightCreate']
}

const COLOR_MAP: Record<string, string> = {
  yellow: 'rgba(253,224,71,0.40)',
  green:  'rgba(74,222,128,0.40)',
  blue:   'rgba(96,165,250,0.40)',
  pink:   'rgba(244,114,182,0.40)',
}

// A highlight spanning multiple lines used to be drawn as a single box (the
// union of every line's rect), which visually expanded to cover whole lines
// that were only partially selected — e.g. selecting one full line plus half
// of the next made the highlight cover all of the second line too. Returning
// one rect per line (plus the union, kept for sorting/back-compat) lets the
// caller draw a highlight that hugs the actual selected text on each line.
function getSelectionPageRects(selection: Selection): { page: number; bbox: PageRect; rects: PageRect[] } | null {
  if (selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  // getClientRects() includes a zero-area rect for the <br> pdf.js inserts
  // between lines: since every text span is position:absolute (out of flow),
  // the <br> has no explicit left/top and collapses to the page's top-left
  // corner. Left in, that phantom rect drags the bounding box up to (0,0)
  // whenever a selection crosses a line break, ballooning the highlight to
  // cover the whole top-left of the page.
  const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0)
  if (clientRects.length === 0) return null
  const anchor = selection.anchorNode?.parentElement
  const pageEl = anchor?.closest('[data-page-number]') as HTMLElement | null
  if (!pageEl) return null
  const pageNum = parseInt(pageEl.getAttribute('data-page-number') || '0', 10)
  if (!pageNum) return null
  const pageRect = pageEl.getBoundingClientRect()
  if (pageRect.width === 0 || pageRect.height === 0) return null
  const rects = clientRects.map(r => ({
    x1: Math.max(0, (r.left   - pageRect.left) / pageRect.width),
    y1: Math.max(0, (r.top    - pageRect.top)  / pageRect.height),
    x2: Math.min(1, (r.right  - pageRect.left) / pageRect.width),
    y2: Math.min(1, (r.bottom - pageRect.top)  / pageRect.height),
  }))
  const bbox = {
    x1: Math.min(...rects.map(r => r.x1)), y1: Math.min(...rects.map(r => r.y1)),
    x2: Math.max(...rects.map(r => r.x2)), y2: Math.max(...rects.map(r => r.y2)),
  }
  return { page: pageNum, bbox, rects }
}

function getSelectionAnchors(selection:Selection,container:HTMLElement){
 const range=selection.getRangeAt(0),clientRects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0)
 return Array.from(container.querySelectorAll<HTMLElement>('.react-pdf__Page[data-page-number]')).flatMap(page=>{
  const box=page.getBoundingClientRect();if(!box.width||!box.height)return []
  const rects=clientRects.filter(r=>r.top<box.bottom&&r.bottom>box.top&&r.left<box.right&&r.right>box.left).map(r=>({x1:Math.max(0,(r.left-box.left)/box.width),y1:Math.max(0,(r.top-box.top)/box.height),x2:Math.min(1,(r.right-box.left)/box.width),y2:Math.min(1,(r.bottom-box.top)/box.height)})).filter(r=>r.x2>r.x1&&r.y2>r.y1)
  if(!rects.length)return []
  const walker=document.createTreeWalker(page.querySelector('.textLayer')||page,NodeFilter.SHOW_TEXT);let node:Node|null,text=''
  while((node=walker.nextNode())){if(!range.intersectsNode(node))continue;const value=node.textContent||'';text+=value.slice(node===range.startContainer?range.startOffset:0,node===range.endContainer?range.endOffset:value.length)}
  return [{page:Number(page.dataset.pageNumber),text:text.trim(),rects}]
 })
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

function normalizePage(page: number | undefined): number {
  return Number.isInteger(page) && Number(page) > 0 ? Number(page) : 1
}

// Module-level constant so react-pdf's loadDocument effect never sees a new
// object reference, preventing spurious document destroy/reload cycles.
const PDF_OPTIONS = {
  withCredentials: true,
  // PDF.js needs these assets to decode JPEG2000 page images and to load
  // fallback fonts. Vite exposes them at these stable paths in dev and in
  // the production bundle (see vite.config.ts).
  wasmUrl: '/pdfjs/wasm/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
}

export default function PdfViewer({
  url, initialPage = 1, pageRequest, isResizing, onPageChange, onTextSelected,
  annotations, onHighlightCreate, onNoteCreate, onAnchoredNote, onHighlightClick, onHighlightDelete,
}: Props) {
  const requestedPage = normalizePage(pageRequest?.page??initialPage)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(requestedPage)
  const [restored, setRestored] = useState(false)
  const [pageLayoutVersion, setPageLayoutVersion] = useState(0)
  const notifyPageRendered = useCallback(() => setPageLayoutVersion(value => value + 1), [])
  const [highlightColor,setHighlightColor]=useState('yellow')
  const [pageDraft,setPageDraft]=useState('')
  const [activeHighlight,setActiveHighlight]=useState<Annotation|null>(null)
  const [removingHighlight,setRemovingHighlight]=useState(false)
  const [actionError,setActionError]=useState('')
  useEffect(()=>{const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){setBubble(null);setActiveHighlight(null);window.getSelection()?.removeAllRanges()}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[])
  const [scale, setScale] = useState(1.0)
  const [fitWidth, setFitWidth] = useState(true)
  const [containerWidth, setContainerWidth] = useState(800)
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string; coords: ReturnType<typeof getSelectionPageRects>;anchors:{page:number;text:string;rects:PageRect[]}[] } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentPageRef = useRef(requestedPage)
  // Use a ref so the ResizeObserver callback always sees the current value
  // without needing to re-subscribe the observer on every drag start/end.
  const isResizingRef = useRef(isResizing)
  useEffect(() => { isResizingRef.current = isResizing }, [isResizing])

  // Measure scroll area width for fit-width
  useEffect(() => {
    const measure = () => {
      const el = scrollRef.current
      if (!el) return
      // clientWidth excludes scrollbar; subtract 2px for border/rounding
      const padding = getComputedStyle(el)
      const w = el.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - 2
      if (w > 100) setContainerWidth(w)
    }
    // Measure after paint
    requestAnimationFrame(() => requestAnimationFrame(measure))
    const obs = new ResizeObserver(() => {
      // Skip pdfjs re-renders while the user is actively dragging the split handle.
      // Measure once when drag ends (see isResizing effect below).
      if (!isResizingRef.current) measure()
    })
    if (scrollRef.current) obs.observe(scrollRef.current)
    return () => obs.disconnect()
  }, [url])

  // When drag ends, take one final measurement so the PDF snaps to the new width.
  // Defer the update by 200 ms so any in-flight pdfjs render tasks that were
  // started at the old width have time to finish before we issue a new one.
  // Firing synchronously on mouse-up races with those tasks and produces the
  // "Cannot read properties of null (reading 'sendWithPromise')" crash.
  useEffect(() => {
    if (!isResizing) {
      const timer = setTimeout(() => {
        const el = scrollRef.current
        if (!el) return
        const padding = getComputedStyle(el)
        const w = el.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - 2
        if (w > 100) setContainerWidth(w)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isResizing])

  // Text selection bubble
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) return
        const text = selection.toString().trim()
        if (!text) return
        const container = containerRef.current
        if (!container) return
        const anchor = selection.anchorNode
        if (!anchor || !container.contains(anchor)) return
        const rect = container.getBoundingClientRect()
        const coords = getSelectionPageRects(selection)
        setBubble({ x: e.clientX - rect.left, y: e.clientY - rect.top, text, coords,anchors:getSelectionAnchors(selection,container) })
      }, 80)
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-ask-bubble]')) setBubble(null)
    }
    const handleSelectionChange=()=>{const selection=window.getSelection();if(!selection||selection.isCollapsed)return;const range=selection.getRangeAt(0),box=range.getBoundingClientRect();handleMouseUp({clientX:box.left,clientY:box.bottom} as MouseEvent)}
    document.addEventListener('selectionchange',handleSelectionChange)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('selectionchange',handleSelectionChange)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  const handleAsk = () => {
    if (!bubble) return
    onTextSelected?.(bubble.text,bubble.anchors)
    setBubble(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleHighlight = (withNote=false) => {
    if (!bubble?.coords) return
    if(withNote&&onAnchoredNote&&bubble.anchors.length){onAnchoredNote(bubble.anchors);setBubble(null);window.getSelection()?.removeAllRanges();return}
    const { page, bbox, rects } = bubble.coords
    const create = withNote ? onNoteCreate : onHighlightCreate
    create?.({ page_number: page, x1: bbox.x1, y1: bbox.y1, x2: bbox.x2, y2: bbox.y2, rects, text: bubble.text, color: highlightColor })
    setBubble(null)
    window.getSelection()?.removeAllRanges()
  }

  const zoomIn = () => {
    setFitWidth(false)
    setScale(s => Math.min(2.0, +(s + 0.25).toFixed(2)))
  }
  const zoomOut = () => {
    setFitWidth(false)
    setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))
  }
  const setFit = () => setFitWidth(true)
  const setZoomLevel = (z: number) => { setFitWidth(false); setScale(z) }
  function jump(page:number){
    const scroll=scrollRef.current
    if(!scroll||!numPages)return
    const next=Math.max(1,Math.min(numPages,page))
    const target=scroll.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`)
    if(target){scroll.scrollTop+=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top-16;setCurrentPage(next);currentPageRef.current=next;onPageChange?.(next)}
  }
  const appliedPageRequest=useRef<number|undefined>(undefined)
  useEffect(()=>{
    if(!pageRequest||!restored||appliedPageRequest.current===pageRequest.key)return
    jump(pageRequest.page)
    const target=scrollRef.current?.querySelector<HTMLElement>('[data-pdf-page="'+pageRequest.page+'"]')
    if(target?.dataset.pdfReady==='true')appliedPageRequest.current=pageRequest.key
  },[pageRequest?.key,numPages,restored,pageLayoutVersion])

  // Always pass width in fit mode; pass scale only in manual zoom mode
  const pageWidth = fitWidth ? containerWidth || undefined : undefined
  const pageScale = fitWidth ? undefined : scale

  // Every lazy page has a full-size placeholder, so a deep page can be located
  // before its PDF canvas is mounted. Wait until both the document and the
  // measured fit-width layout exist, then align the saved page in the reader.
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || !numPages || restored) return
    const page = Math.min(numPages, normalizePage(pageRequest?.page??initialPage))
    const timer = setTimeout(() => {
      const target = scroll.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`)
      if (!target) return
      const scrollRect = scroll.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      scroll.scrollTop += targetRect.top - scrollRect.top - 16
      // Loading pages begin with estimated heights. Align again after their
      // actual canvases settle, before reporting restored reading progress.
      if (target.dataset.pdfReady !== 'true' ||
          scroll.querySelector('[data-pdf-mounted="true"][data-pdf-ready="false"]')) return
      currentPageRef.current = page
      setCurrentPage(page)
      setRestored(true)
    }, 0)
    return () => clearTimeout(timer)
  }, [containerWidth, initialPage, pageRequest?.key, numPages, restored, url, pageLayoutVersion])

  // A narrow observation band through the viewport center defines the current
  // reading page. This stays correct for mixed page sizes and avoids doing a
  // getBoundingClientRect scan across hundreds of pages on every scroll event.
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || !restored || !numPages || isResizing) return
    const pages = Array.from(scroll.querySelectorAll<HTMLElement>('[data-pdf-page]'))
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting)
      if (!visible.length) return
      const rootCenter = visible[0]?.rootBounds
        ? (visible[0].rootBounds!.top + visible[0].rootBounds!.bottom) / 2
        : scroll.getBoundingClientRect().top + scroll.clientHeight / 2
      const closest = visible.reduce((best, entry) => {
        const distance = Math.abs((entry.boundingClientRect.top + entry.boundingClientRect.bottom) / 2 - rootCenter)
        const bestDistance = Math.abs((best.boundingClientRect.top + best.boundingClientRect.bottom) / 2 - rootCenter)
        return distance < bestDistance ? entry : best
      })
      const page = Number((closest.target as HTMLElement).dataset.pdfPage)
      if (!Number.isInteger(page) || page === currentPageRef.current) return
      currentPageRef.current = page
      setCurrentPage(page)
      onPageChange?.(page)
    }, { root: scroll, rootMargin: '-47% 0px -47% 0px', threshold: 0 })
    for (const page of pages) observer.observe(page)
    return () => observer.disconnect()
  }, [isResizing, numPages, onPageChange, restored, url])

  if (!url) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--muted)', fontSize: 15, flexDirection: 'column', gap: 12, height: '100%',
        background: 'var(--bg)',
      }}>
        <div style={{ fontSize: 48 }}>📄</div>
        <div>粘贴 PDF 链接或打开本地文件以开始阅读</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      {/* Toolbar */}
      <div className="pdf-toolbar" style={{
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '8px 16px',
        background: 'var(--panel)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button onClick={zoomOut} title="缩小" style={btnStyle}>−</button>
        <select
          value={fitWidth ? 'fit' : String(scale)}
          onChange={e => e.target.value === 'fit' ? setFit() : setZoomLevel(parseFloat(e.target.value))}
          style={{ background: '#0f0f0f', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="fit">适应宽度</option>
          {ZOOM_LEVELS.map(z => (
            <option key={z} value={z}>{Math.round(z * 100)}%</option>
          ))}
        </select>
        <button onClick={zoomIn} title="放大" style={btnStyle}>+</button>
        <form className="page-jump" onSubmit={event=>{event.preventDefault();const page=Number(pageDraft);if(Number.isInteger(page)&&page>0)jump(page);setPageDraft('')}}>
          <input aria-label="跳转页码" name="pdfPage" inputMode="numeric" type="number" min={1} max={numPages||1} placeholder={String(currentPage)} value={pageDraft} onChange={event=>setPageDraft(event.target.value)}/><button type="submit">跳转</button>
        </form>
        {numPages > 0 && (
          <span data-testid="page-progress" aria-live="polite" style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
            第 {Math.min(currentPage, numPages)} 页 / 共 {numPages} 页
          </span>
        )}
      </div>

      {/* PDF scroll area */}
      <div ref={scrollRef} data-testid="pdf-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}>
        <Document
          key={url}
          file={url}
          options={PDF_OPTIONS}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={err => console.error("PDF 加载失败：", err)}
          loading={<LoadingPage />}
          error={<ErrorPage />}
        >
          {Array.from({ length: numPages }, (_, i) => {
            const pageNum = i + 1
            const pageAnnotations = (annotations ?? []).filter(a => a.page_number === pageNum)
            return (
              <LazyPdfPage
                key={i}
                pageNumber={pageNum}
                citation={pageRequest?.page===pageNum&&(pageRequest.excerpt||pageRequest.rects?.length)?{key:pageRequest.key,excerpt:pageRequest.excerpt||'',rects:pageRequest.rects}:undefined}
                pageWidth={pageWidth}
                pageScale={pageScale}
                onPageRendered={notifyPageRendered}
                annotations={pageAnnotations}
                onHighlightClick={annotation=>{setActiveHighlight(annotation);setActionError('');onHighlightClick?.(annotation)}}
              />
            )
          })}
        </Document>
      </div>

      {activeHighlight&&onHighlightDelete&&<div className="highlight-actions" role="group" aria-label="高亮操作"><span title={activeHighlight.text}>{activeHighlight.text.slice(0,24)}</span><button className="secondary" disabled={removingHighlight} onClick={async()=>{if(activeHighlight.note&&!confirm('取消高亮也会删除对应的文字注释，继续吗？'))return;setRemovingHighlight(true);try{await onHighlightDelete(activeHighlight.id);setActiveHighlight(null)}catch(e){setActionError(e instanceof Error?e.message:'取消失败，请重试。')}finally{setRemovingHighlight(false)}}}>{removingHighlight?'正在取消…':'取消高亮'}</button><button className="text-button" aria-label="关闭高亮操作" onClick={()=>setActiveHighlight(null)}>×</button>{actionError&&<span role="alert">{actionError}</span>}</div>}
      {/* Selection bubble */}
      {bubble && (
        <div
          data-ask-bubble="1"
          style={{
            position: 'absolute',
            left: Math.max(4,Math.min(bubble.x, (containerRef.current?.clientWidth ?? 400) - 360)),
            top: Math.max(bubble.y - 48, 8),
            display: 'flex', gap: 6, zIndex: 9999, userSelect: 'none', flexWrap:'wrap', maxWidth:'calc(100% - 8px)', padding:8, background:'#20232b',border:'1px solid var(--border)',borderRadius:10,
          }}
        >
          {bubble.coords && (
            <ColorPicker value={highlightColor} onChange={setHighlightColor}/>
          )}
          {bubble.coords && (
            <button
              onClick={()=>handleHighlight()}
              style={{
                background: '#854d0e', color: '#fef08a',
                border: 'none', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
              }}
            >
              高亮
            </button>
          )}
          <button
            onClick={handleAsk}
            style={{
              background: 'var(--accent)', color: '#fff',
              border: 'none', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
            }}
          >
            提问
          </button>
          {bubble.coords && onNoteCreate && <button className="secondary" onClick={()=>handleHighlight(true)}>添加注释</button>}
        </div>
      )}
    </div>
  )
}

interface LazyPdfPageProps {
  pageNumber: number
  citation?: {key:number;excerpt:string;rects?:PageRect[]}
  pageWidth?: number
  pageScale?: number
  annotations: Annotation[]
  onHighlightClick?: (annotation: Annotation) => void
  onPageRendered?: () => void
}

// The viewer can contain hundreds of pages. Mounting a canvas and text layer
// for every page at once overwhelms the browser (especially for scanned PDFs
// whose pages contain JPEG2000 images), leaving later canvases permanently
// hidden while their text layers remain selectable. Keep the layout with a
// lightweight placeholder and only mount pages as they approach the viewport.
const PAGE_ASPECT_RATIO = 1.53

function LazyPdfPage({ pageNumber, citation, pageWidth, pageScale, annotations, onHighlightClick, onPageRendered }: LazyPdfPageProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const [shouldRender, setShouldRender] = useState(pageNumber === 1)
  const [aspectRatio,setAspectRatio]=useState(PAGE_ASPECT_RATIO)
  const [renderReady, setRenderReady] = useState(false)
  const [textReady,setTextReady]=useState(false)
  const [citationRects,setCitationRects]=useState<PageRect[]>([])
  const handleTextRenderSuccess=useCallback(()=>setTextReady(true),[])
  useEffect(() => {setRenderReady(false);setTextReady(false)}, [pageWidth, pageScale])
  const handleRenderSuccess = useCallback(() => {
    setRenderReady(true)
    onPageRendered?.()
  }, [onPageRendered])

  useEffect(() => {
    if (shouldRender || !pageRef.current) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setShouldRender(true)
          observer.disconnect()
        }
      },
      { rootMargin: '1200px 0px' },
    )
    observer.observe(pageRef.current)
    return () => observer.disconnect()
  }, [shouldRender])

  useEffect(()=>{
    setCitationRects([])
    if(!citation||!textReady||!pageRef.current)return
    const page=pageRef.current.querySelector('.react-pdf__Page') as HTMLElement|null
    if(!page)return
    if(citation.rects?.length){setCitationRects(citation.rects);const timer=setTimeout(()=>setCitationRects([]),8000);return()=>clearTimeout(timer)}
    const walker=document.createTreeWalker(page.querySelector('.textLayer')??page,NodeFilter.SHOW_TEXT)
    const chars:{node:Node;offset:number}[]=[];let text='',node:Node|null
    while((node=walker.nextNode())){const value=node.textContent??'';for(let i=0;i<value.length;i++)if(!/\s/.test(value[i])){text+=value[i];chars.push({node,offset:i})}}
    const needle=citation.excerpt.replace(/\s/g,'').slice(0,160),start=needle?text.indexOf(needle):-1
    if(start<0)return
    const first=chars[start],last=chars[start+needle.length-1],range=document.createRange()
    range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset+1)
    const box=page.getBoundingClientRect()
    if(!box.width||!box.height)return
    setCitationRects(Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).map(r=>({x1:(r.left-box.left)/box.width,y1:(r.top-box.top)/box.height,x2:(r.right-box.left)/box.width,y2:(r.bottom-box.top)/box.height})))
    const timer=setTimeout(()=>setCitationRects([]),8000)
    return()=>clearTimeout(timer)
  },[citation?.key,textReady,pageWidth,pageScale])

  const placeholderWidth = pageWidth ?? 600 * (pageScale ?? 1)
  const placeholderHeight = placeholderWidth * aspectRatio

  return (
    <div
      ref={pageRef}
      data-pdf-page={pageNumber}
      data-pdf-mounted={shouldRender}
      data-pdf-ready={renderReady}
      aria-label={`第 ${pageNumber} 页`}
      style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, position: 'relative', minHeight: placeholderHeight }}
    >
      <div data-highlight-layer="true" style={{ position: 'relative',alignSelf:'flex-start' }}>
        {shouldRender ? (
          <Page
            pageNumber={pageNumber}
            width={pageWidth}
            scale={pageScale}
            onLoadSuccess={page=>{const viewport=page.getViewport({scale:1});setAspectRatio(viewport.height/viewport.width)}}
            onRenderSuccess={handleRenderSuccess}
            onRenderTextLayerSuccess={handleTextRenderSuccess}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            loading={<LoadingPage />}
            error={<ErrorPage />}
          />
        ) : (
          <div style={{ width: placeholderWidth, height: placeholderHeight, background: 'white' }} aria-label={`第 ${pageNumber} 页`} />
        )}
        {citationRects.map((r,i)=><div key={'citation-'+i} data-citation-highlight="true" aria-hidden="true" style={{position:'absolute',left:r.x1*100+'%',top:r.y1*100+'%',width:(r.x2-r.x1)*100+'%',height:(r.y2-r.y1)*100+'%',background:'rgba(96,165,250,.36)',outline:'1px solid rgba(59,130,246,.5)',pointerEvents:'none',zIndex:3,mixBlendMode:'multiply'}}/>)}
        {annotations.map(ann =>
          // rects gives one box per selected line; annotations from before
          // that field existed only have the x1..y2 union.
          (ann.rects && ann.rects.length ? ann.rects : [ann]).map((r, i) => (
            <div
              key={`${ann.id}-${i}`}
              onClick={() => onHighlightClick?.(ann)}
              title={ann.note ? `${ann.text}\n注释：${ann.note}` : ann.text}
              data-annotation-id={ann.id}
              role="button" tabIndex={0} aria-label={`查看第 ${ann.page_number} 页的高亮`}
              onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onHighlightClick?.(ann)}}}
              style={{
                position: 'absolute',
                left:   `${r.x1 * 100}%`,
                top:    `${r.y1 * 100}%`,
                width:  `${(r.x2 - r.x1) * 100}%`,
                height: `${(r.y2 - r.y1) * 100}%`,
                background: COLOR_MAP[ann.color] ?? COLOR_MAP.yellow,
                pointerEvents: 'auto',
                cursor: 'pointer',
                zIndex: 2,
                borderRadius: 2,
                mixBlendMode: 'multiply',
              }}
            />
          )),
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#2a2a2a', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 6, width: 28, height: 28, fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
}

function LoadingPage() {
  return (
    <div style={{ width: 600, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
      <span className="spinner" />
    </div>
  )
}

function ErrorPage() {
  return (
    <div style={{ width: 600, padding: 16, color: '#f87171', background: '#2d1515', borderRadius: 8, textAlign: 'center' }}>
      ⚠️ 页面渲染失败
    </div>
  )
}
