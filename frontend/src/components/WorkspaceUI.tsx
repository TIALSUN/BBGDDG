import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
export function Brand() { return <Link to="/" className="brand"><span className="brand-symbol" aria-hidden="true">P</span><span>PDFPal<small>阅读 · 思考 · 记录</small></span></Link> }
export function EmptyState({ title, children }: { title: string; children: ReactNode }) { return <div className="empty-state"><span className="empty-mark" aria-hidden="true">⌑</span><h3>{title}</h3><p>{children}</p></div> }
export const colors = { yellow: '#e9c76b', green: '#87c9a1', blue: '#8baef0', pink: '#dca3c4' }
export const colorNames = {yellow:'黄色',green:'绿色',blue:'蓝色',pink:'粉色'}
export function ColorPicker({ value, onChange, disabled=false }: {value:string;onChange:(value:string)=>void;disabled?:boolean}) { return <div className="color-picker" aria-label="高亮颜色">{Object.entries(colors).map(([id,color])=><button key={id} type="button" disabled={disabled} title={colorNames[id as keyof typeof colorNames]} aria-label={`${colorNames[id as keyof typeof colorNames]}高亮`} aria-pressed={value===id} style={{background:color}} onClick={()=>onChange(id)} />)}</div> }
