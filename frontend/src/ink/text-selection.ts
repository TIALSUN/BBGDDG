export function selectPdfText(page:HTMLElement,start:{x:number;y:number},end:{x:number;y:number}){
 const layer=page.querySelector('.textLayer');if(!layer)return false
 const walker=document.createTreeWalker(layer,NodeFilter.SHOW_TEXT),characters:{node:Node;offset:number;box:DOMRect}[]=[]
 let node:Node|null
 while((node=walker.nextNode())){for(let offset=0;offset<(node.textContent?.length||0);offset++){const range=document.createRange();range.setStart(node,offset);range.setEnd(node,offset+1);const box=range.getBoundingClientRect();if(box.width&&box.height)characters.push({node,offset,box})}}
 if(!characters.length)return false
 function nearest(p:{x:number;y:number}){let best=0,distance=Infinity;characters.forEach(({box},i)=>{const dx=Math.max(box.left-p.x,0,p.x-box.right),dy=Math.max(box.top-p.y,0,p.y-box.bottom),d=dx*dx+dy*dy*dy*dy;if(d<distance){distance=d;best=i}});return best}
 const a=nearest(start),b=nearest(end),first=characters[Math.min(a,b)],last=characters[Math.max(a,b)],range=document.createRange()
 range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset+1)
 const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);return !!range.toString().trim()
}
