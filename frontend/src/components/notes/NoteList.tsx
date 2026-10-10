import type {Note} from '../../lib/api'
export default function NoteList({notes,activeId,onOpen}:{notes:Note[];activeId?:string;onOpen:(note:Note)=>void}){
 return <nav className="note-list" aria-label="笔记列表">{notes.length?notes.map(note=><button key={note.id} aria-current={activeId===note.id?'page':undefined} onClick={()=>onOpen(note)}><strong>{note.title}</strong>{note.anchors?.[0]&&<small>{note.anchors[0].unit==='paragraph'?'第':'PDF 第'} {note.anchors[0].page} {note.anchors[0].unit==='paragraph'?'段':'页'}</small>}<span>{note.preview||'暂无正文'}</span></button>):<p>暂无已保存笔记。创建一篇，记录你的理解。</p>}</nav>
}
