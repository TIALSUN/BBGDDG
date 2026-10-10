import {useEffect,useState} from 'react'
export type ReaderTool='chat'|'notes'|'annotations'|'related'
export default function useReaderLayout(){
 const [activeTool,setTool]=useState<ReaderTool>(()=>new URLSearchParams(location.search).get('mode')==='notes'||location.pathname.includes('/notes/')?'notes':'chat')
 const [panelOpen,setPanelOpen]=useState(()=>window.innerWidth>=900)
 const [requestedWidth,setRequestedWidth]=useState(420)
 const [width,setWidth]=useState(window.innerWidth)
 useEffect(()=>{const resize=()=>setWidth(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
 const panelWidth=width<900?requestedWidth:Math.max(320,Math.min(requestedWidth,720,width*.55))
 return {activeTool,panelOpen,panelWidth,setTool,setPanelOpen,setPanelWidth:setRequestedWidth}
}
