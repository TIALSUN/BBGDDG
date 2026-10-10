import type {InkPoint,InkStroke} from '../../../src/core/ink-types'
function inside(p:InkPoint,polygon:InkPoint[]){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit}return hit}
export function selectStrokes(strokes:InkStroke[],polygon:InkPoint[]){if(polygon.length<3)return [];return strokes.filter(s=>s.points.every(p=>inside(p,polygon))).map(s=>s.id)}
