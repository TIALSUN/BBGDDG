import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {useNavigate} from 'react-router-dom'
import type {ChatReference,ContextScope} from '../lib/api'
export const scopeLabels:Record<ContextScope,string>={selection:'选中文字',document:'当前 PDF',project:'项目文献'}
export default function ChatAnswer({content,references=[],contextScope,projectId,onReference}:{content:string;references?:ChatReference[];contextScope?:ContextScope;projectId?:string|null;onReference?:(r:ChatReference)=>void}){
 const navigate=useNavigate()
 const open=(r:ChatReference)=>{if(!r.canJump||!projectId)return;if(onReference)onReference(r);else navigate('/projects/'+projectId+'/sources/'+r.sourceId,{state:{citation:r}})}
 // Convert only known numbered citations in prose; leave code and existing
 // links untouched, and never turn a model-invented number into a destination.
 const citationPlugin=()=> (tree:any)=>{
  const visit=(node:any)=>{if(!node.children||['link','code','inlineCode'].includes(node.type))return;node.children=node.children.flatMap((child:any)=>{if(child.type!=='text'){visit(child);return [child]};const text=child.value as string,out:any[]=[];let cursor=0;for(const match of text.matchAll(/\[(\d+)\]/g)){const r=references.find(r=>r.id===Number(match[1])&&r.canJump);if(!r)continue;const index=match.index!;if(index>cursor)out.push({type:'text',value:text.slice(cursor,index)});out.push({type:'link',url:'#citation-'+r.id,children:[{type:'text',value:match[0]}]});cursor=index+match[0].length}if(cursor<text.length)out.push({type:'text',value:text.slice(cursor)});return out.length?out:[child]})};visit(tree)
 }
 return <div className="chat-answer"><div className="prose"><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath,citationPlugin]} rehypePlugins={[rehypeKatex]} components={{a:({href,children,...props})=>{const r=references.find(r=>href==='#citation-'+r.id&&r.canJump);return r?<button type="button" className="citation-link" title={r.title+' · 第 '+r.page+' 页'} onClick={()=>open(r)}>{children}</button>:<a {...props} href={href}>{children}</a>}}}>{content}</ReactMarkdown></div>{contextScope&&<small className="answer-scope">回答范围：{scopeLabels[contextScope]}</small>}{references.length>0&&<details className="chat-references"><summary>参考片段 · {references.length}</summary>{references.map(r=><div key={r.id}><button type="button" className="reference-jump" disabled={!r.canJump} onClick={()=>open(r)}>[{r.id}] {r.title} · {r.page>0?'第 '+r.page+' 页':'页码未定位'}</button><p>{r.excerpt}</p></div>)}</details>}</div>
}
