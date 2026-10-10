import type {Annotation} from '../lib/api'
import type {InkDocument} from '../../../src/core/ink-types'
export type ReviewItem={id:string;kind:'highlight'|'underline'|'ink'|'image';sourceId:string;page:number;color:string;targetId:string}
export function buildAnnotationIndex(annotations:Annotation[],ink:InkDocument[]):ReviewItem[]{
 const items:ReviewItem[]=annotations.map(a=>({id:a.id,kind:'highlight',sourceId:a.source_id,page:a.page_number,color:a.color,targetId:a.id}))
 for(const document of ink){const target=document.target;if(target.kind!=='pdf')continue;for(const block of document.blocks){for(const stroke of block.strokes)items.push({id:`${target.sourceId}:${target.page}:${stroke.id}`,kind:stroke.tool==='line'?'underline':stroke.tool==='marker'?'highlight':'ink',sourceId:target.sourceId,page:target.page,color:stroke.color,targetId:stroke.id});for(const image of block.images||[])items.push({id:image.id,kind:'image',sourceId:target.sourceId,page:target.page,color:'',targetId:image.id})}}
 return items.sort((a,b)=>a.page-b.page)
}
