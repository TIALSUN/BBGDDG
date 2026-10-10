import {useRef} from 'react'
import type {InkMode} from './InkCanvas'
export type InkSettings={mode:InkMode;color:string;width:number;finger:boolean;hidden:boolean;leftHanded:boolean;bottom:boolean}
export const defaultInkSettings:InkSettings={mode:'browse',color:'#111827',width:2,finger:false,hidden:false,leftHanded:false,bottom:false}
export default function InkToolbar({settings,onChange,undo,redo,sourceTools=false}:{sourceTools?:boolean;settings:InkSettings;onChange:(settings:InkSettings)=>void;undo?:()=>void;redo?:()=>void}){
 const toolbar=useRef<HTMLDivElement>(null)
 return <div ref={toolbar} style={{flexDirection:settings.leftHanded?'row-reverse':undefined,order:sourceTools&&settings.bottom?5:undefined}} className="ink-toolbar" role="toolbar" aria-label="手写工具">
 {([['browse','浏览'],['pen','钢笔'],['marker','荧光笔'],['line','划线'],['eraser','整笔橡皮'],['lasso','套索选择'],['text','文字选择'],['region','区域摘录']] as const).filter(([mode])=>sourceTools||(mode!=='text'&&mode!=='region')).map(([mode,label])=><button className="secondary" key={mode} aria-pressed={settings.mode===mode} onClick={()=>onChange({...settings,mode})}>{label}</button>)}
 <label>颜色<select aria-label="手写颜色" value={settings.color} onChange={e=>onChange({...settings,color:e.target.value})}>{[['#111827','墨黑'],['#788bea','靛蓝'],['#e9c76b','暖黄'],['#87c9a1','薄荷绿'],['#dca3c4','粉色'],['#8baef0','蓝色'],['#edf0f7','白色']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <label>粗细<select aria-label="手写粗细" value={settings.width} onChange={e=>onChange({...settings,width:Number(e.target.value)})}>{[1,2,4,8].map(n=><option key={n}>{n}</option>)}</select></label>
 {undo&&<button className="secondary" onClick={undo}>撤销手写</button>}{redo&&<button className="secondary" onClick={redo}>重做手写</button>}
 <label><input type="checkbox" checked={settings.finger} onChange={e=>onChange({...settings,finger:e.target.checked})}/>手指绘制</label>
 <label><input type="checkbox" checked={settings.hidden} onChange={e=>onChange({...settings,hidden:e.target.checked})}/>隐藏笔迹</label>
 <label title="将常用工具从右侧排列，避开左手掌"><input type="checkbox" checked={settings.leftHanded} onChange={e=>{onChange({...settings,leftHanded:e.target.checked});requestAnimationFrame(()=>{if(toolbar.current)toolbar.current.scrollLeft=e.target.checked?toolbar.current.scrollWidth:0})}}/>左手布局</label>{sourceTools&&<label><input type="checkbox" checked={settings.bottom} onChange={e=>onChange({...settings,bottom:e.target.checked})}/>底部工具栏</label>}
 </div>
}
