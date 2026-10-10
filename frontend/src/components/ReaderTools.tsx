import type {ReaderTool} from '../hooks/useReaderLayout'
export default function ReaderTools({activeTool,panelOpen,onSelect}:{activeTool:ReaderTool;panelOpen:boolean;onSelect:(tool:ReaderTool)=>void}){
 return <nav className="tablet-reader-tools" aria-label="平板阅读工具">{([['chat','AI 问答'],['notes','笔记'],['annotations','标注']] as [ReaderTool,string][]).map(([id,label])=><button key={id} aria-label={`打开${label}`} aria-pressed={panelOpen&&activeTool===id} onClick={()=>onSelect(id)}>{label}</button>)}</nav>
}
