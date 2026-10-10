export type InkPoint={x:number;y:number;pressure?:number}
export type InkStroke={id:string;tool:'pen'|'marker'|'line';color:string;width:number;points:InkPoint[]}
export type InkImage={id:string;attachmentId:string;x:number;y:number;width:number;height:number}
export type InkBlock={id:string;height:number;background:'blank'|'ruled'|'grid';strokes:InkStroke[];images?:InkImage[]}
export type InkTarget={kind:'pdf';sourceId:string;page:number;contentHash:string}|{kind:'note';noteId:string}
export type InkDocument={version:1;revision:number;target:InkTarget;blocks:InkBlock[]}
export const inkColors=['#788bea','#edf0f7','#e9c76b','#87c9a1','#dca3c4','#8baef0','#111827'] as const
