import type {InkPoint} from '../../../src/core/ink-types'
export class InkInput {
 private pointer:number|null=null
 private points:InkPoint[]=[]
 begin(id:number,point:InkPoint){if(this.pointer!==null){this.cancel();return false}this.pointer=id;this.points=[point];return true}
 move(id:number,point:InkPoint){if(this.pointer===id)this.points.push(point)}
 end(id:number){if(id!==this.pointer)return [];const points=this.points;this.cancel();return points}
 cancel(){this.pointer=null;this.points=[]}
}
