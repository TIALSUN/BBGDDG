import {useSyncExternalStore} from 'react'
import type {AiUsage,ChatReference,ContextScope,NoteAnchor} from './api'
export interface Message {role:'user'|'assistant';content:string;usage?:AiUsage;references?:ChatReference[];contextScope?:ContextScope;anchors?:NoteAnchor[]}
interface State {messages:Message[];loading:boolean;error:string;revision:number}
interface Task {state:State;listeners:Set<()=>void>;controller?:AbortController}
const tasks=new Map<string,Task>()
function task(key:string){let value=tasks.get(key);if(!value){value={state:{messages:[],loading:false,error:'',revision:0},listeners:new Set()};tasks.set(key,value)}return value}
export function updateChat(key:string,change:Partial<State>){const value=task(key);value.state={...value.state,...change,revision:value.state.revision+1};value.listeners.forEach(listener=>listener())}
export function useChatTask(key:string){return useSyncExternalStore(listener=>{const value=task(key);value.listeners.add(listener);return()=>{value.listeners.delete(listener)}},()=>task(key).state)}
export function chatRevision(key:string){return task(key).state.revision}
export function stopChat(key:string){task(key).controller?.abort()}
export async function sendChat(key:string,body:Record<string,unknown>,history:Message[],anchors:NoteAnchor[]){
 const value=task(key);if(value.state.loading)return
 const controller=new AbortController();value.controller=controller
 updateChat(key,{messages:history,loading:true,error:''})
 try{
  const response=await fetch('/api/chat',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal})
  if(!response.ok){const data=await response.json();throw new Error(data.detail||'对话请求失败')}
  const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',answer:Message={role:'assistant',content:'',anchors},warning=''
  const parse=(line:string)=>{if(!line.startsWith('data: ')||line.slice(6)==='[DONE]')return;let data;try{data=JSON.parse(line.slice(6))}catch{return}if(data.error)throw new Error(data.error);answer={...answer,content:data.text??answer.content,usage:data.usage??answer.usage,references:data.references??answer.references,contextScope:data.contextScope??answer.contextScope};if(data.memoryWarning)warning=data.memoryWarning}
  while(true){const {done,value:chunk}=await reader.read();buffer+=decoder.decode(chunk,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';lines.forEach(parse);if(done){if(buffer)parse(buffer);break}}
  controller.signal.throwIfAborted()
  if(!answer.content.trim())throw new Error('模型没有返回可显示的回答，请重试。')
  updateChat(key,{messages:[...history,answer],error:warning})
  window.dispatchEvent(new Event('bbgddg-ai-change'))
  return true
 }catch(error){updateChat(key,{error:controller.signal.aborted?'已停止生成。问题已保留，可以重新发送。':error instanceof Error?error.message:'对话请求失败'})}
 finally{value.controller=undefined;updateChat(key,{loading:false})}
}
