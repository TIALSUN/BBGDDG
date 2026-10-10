export async function captureRegion(canvas:HTMLCanvasElement,rect:[number,number,number,number]):Promise<Blob>{
 const [x1,y1,x2,y2]=rect
 if(rect.some(n=>!Number.isFinite(n)||n<0||n>1)||x2<=x1||y2<=y1)throw new Error('请选择有效的单页区域。')
 const output=document.createElement('canvas');output.width=Math.max(1,Math.round((x2-x1)*canvas.width));output.height=Math.max(1,Math.round((y2-y1)*canvas.height))
 if(output.width>4096||output.height>4096||output.width*output.height>8000000)throw new Error('摘录范围过大，请缩小选区。')
 output.getContext('2d')!.drawImage(canvas,x1*canvas.width,y1*canvas.height,(x2-x1)*canvas.width,(y2-y1)*canvas.height,0,0,output.width,output.height)
 return new Promise((resolve,reject)=>output.toBlob(blob=>blob&&blob.size<=5*1024*1024?resolve(blob):reject(new Error('摘录图片超过 5 MiB。')),'image/png'))
}
