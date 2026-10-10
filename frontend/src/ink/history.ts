import type {InkBlock,InkStroke} from '../../../src/core/ink-types'
import {mapPoint} from './geometry'
import type {Matrix} from './geometry'
type Command={type:'addStroke';blockId:string;stroke:InkStroke}|{type:'deleteStrokes';blockId:string;ids:string[]}|{type:'transformStrokes';blockId:string;ids:string[];matrix:Matrix}|{type:'replaceBlocks';blocks:InkBlock[]}
export class InkHistory {
 private states:InkBlock[][]
 private index=0
 constructor(blocks:InkBlock[]){this.states=[structuredClone(blocks)]}
 get blocks(){return structuredClone(this.states[this.index])}
 get canUndo(){return this.index>0}
 get canRedo(){return this.index<this.states.length-1}
 apply(command:Command){
  let blocks=this.blocks
  if(command.type==='replaceBlocks') blocks=structuredClone(command.blocks)
  else {
   const block=blocks.find(b=>b.id===command.blockId)
   if(!block) throw new Error('Ink block missing')
   if(command.type==='addStroke') block.strokes.push(structuredClone(command.stroke))
   else if(command.type==='deleteStrokes') block.strokes=block.strokes.filter(s=>!command.ids.includes(s.id))
   else block.strokes=block.strokes.map(s=>command.ids.includes(s.id)?{...s,points:s.points.map(p=>({...p,...mapPoint(p,command.matrix)}))}:s)
  }
  const previous=new Map(this.states[this.index].flatMap(block=>block.strokes.map(stroke=>[stroke.id,stroke] as const)))
  blocks=blocks.map(block=>({...block,strokes:block.strokes.map(stroke=>{const old=previous.get(stroke.id);return old&&JSON.stringify(old)===JSON.stringify(stroke)?old:stroke})}))
  this.states=this.states.slice(0,this.index+1)
  this.states.push(blocks)
  if(this.states.length>101)this.states.shift()
  this.index=this.states.length-1
  return this.blocks
 }
 undo(){this.index=Math.max(0,this.index-1);return this.blocks}
 redo(){this.index=Math.min(this.states.length-1,this.index+1);return this.blocks}
}
