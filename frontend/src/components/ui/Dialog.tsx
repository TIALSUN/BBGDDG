import {useEffect,useId,useRef,type ReactNode} from 'react'
export type DialogProps={open:boolean;title:string;onClose:()=>void;children:ReactNode;className?:string}
export default function Dialog({open,title,onClose,children,className=''}:DialogProps){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId(),close=useRef(onClose)
 useEffect(()=>{close.current=onClose},[onClose])
 useEffect(()=>{
  const element=ref.current
  if(!open||!element)return
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null
  element.showModal()
  const initial=element.querySelector<HTMLElement>('[autofocus],input:not([disabled]),button:not([disabled])')
  initial?.focus()
  return()=>{element.close();if(trigger?.isConnected)trigger.focus()}
 },[open])
 return <dialog ref={ref} className={`ui-dialog ${className}`} aria-labelledby={titleId} onKeyDown={event=>{
   if(event.key!=='Tab')return
   const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length)
   const first=controls[0],last=controls[controls.length-1]
   if(!first){event.preventDefault();event.currentTarget.focus()}
   else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }} onCancel={event=>{event.preventDefault();close.current()}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close.current()}}}>
  <div className="ui-dialog-content"><h2 id={titleId}>{title}</h2>{children}</div>
 </dialog>
}
