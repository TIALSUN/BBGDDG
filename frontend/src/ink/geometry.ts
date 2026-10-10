export type Matrix = [number, number, number, number, number, number]
type Point={x:number;y:number}
function distance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function cross(a:Point,b:Point,c:Point){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)}
export function pathsIntersectWithin(a:Point[],b:Point[],tolerance:number){
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[Math.min(i+1,a.length-1)],r=b[j],s=b[Math.min(j+1,b.length-1)];const intersects=cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0;if(intersects||Math.min(distance(p,r,s),distance(q,r,s),distance(r,p,q),distance(s,p,q))<=tolerance)return true}
 return false
}
export function mapPoint(p: {x:number;y:number}, m: Matrix) {
 return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]}
}
export function inverse(m: Matrix): Matrix {
 const [a,b,c,d,e,f]=m, determinant=a*d-b*c
 if (!Number.isFinite(determinant)||Math.abs(determinant)<1e-12) throw new Error('Invalid coordinate transform')
 return [d/determinant,-b/determinant,-c/determinant,a/determinant,(c*f-d*e)/determinant,(b*e-a*f)/determinant].map(n=>n===0?0:n) as Matrix
}
