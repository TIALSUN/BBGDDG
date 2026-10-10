import InkConflictActions from './InkConflictActions'
import {useRef,useState} from 'react'
import type {InkBlock} from '../../../src/core/ink-types'
import InkCanvas from './InkCanvas'
import InkToolbar,{defaultInkSettings} from './InkToolbar'
import {InkHistory} from './history'
import {useInkDocument} from './useInkDocument'
export default function NoteInkBlocks({projectId,noteId}:{projectId:string;noteId:string}){
 const ink=useInkDocument(projectId,{kind:'note',noteId}),[settings,setSettings]=useState(defaultInkSettings)
 const history=useRef<InkHistory|null>(null)
 function change(blocks:InkBlock[]){history.current??=new InkHistory(ink.document.blocks);ink.change(history.current.apply({type:'replaceBlocks',blocks}))}
 return <section className="note-ink" aria-label="笔记手写区"><h3>手写区</h3><InkToolbar settings={settings} onChange={setSettings} undo={()=>history.current&&ink.change(history.current.undo())} redo={()=>history.current&&ink.change(history.current.redo())}/>
 <p aria-live="polite"><span>{ink.status}</span><InkConflictActions ink={ink}/> <button className="text-button" onClick={ink.retry}>重试手写保存</button></p>
 <button className="secondary" disabled={!ink.ready} onClick={()=>change([...ink.document.blocks,{id:crypto.randomUUID(),height:600,background:'blank',strokes:[]}])}>添加手写块</button>
 {ink.document.blocks.map((block,index)=><div key={block.id} className="ink-block"><button className="secondary" disabled={index===0} onClick={()=>{const blocks=[...ink.document.blocks];[blocks[index-1],blocks[index]]=[blocks[index],blocks[index-1]];change(blocks)}}>上移手写块</button><button className="secondary" disabled={index===ink.document.blocks.length-1} onClick={()=>{const blocks=[...ink.document.blocks];[blocks[index],blocks[index+1]]=[blocks[index+1],blocks[index]];change(blocks)}}>下移手写块</button><label>纸张<select aria-label="手写纸张" value={block.background} onChange={e=>change(ink.document.blocks.map(b=>b.id===block.id?{...b,background:e.target.value as InkBlock['background']}:b))}><option value="blank">空白</option><option value="ruled">横线</option><option value="grid">方格</option></select></label><button className="secondary" disabled={block.height>=99600} onClick={()=>change(ink.document.blocks.map(b=>b.id===block.id?{...b,height:b.height+400}:b))}>延长纸张</button>
 {!settings.hidden&&<InkCanvas attachmentBase={`/api/projects/${projectId}/ink/attachments`} block={block} {...settings} allowFingerDrawing={settings.finger} onChange={next=>change(ink.document.blocks.map(b=>b.id===block.id?next:b))}/>}
 </div>)}
 </section>
}
