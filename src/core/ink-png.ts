import {inflateSync} from 'node:zlib'
export function validatePng(bytes:Buffer){
 const fail=()=>{throw new Error('只接受完整、非隔行的 RGB/RGBA PNG 图片（最大 5 MiB / 800 万像素）。')}
 if(bytes.length>5*1024*1024||bytes.length<45||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return fail()
 let offset=8,width=0,height=0,channels=0,ended=false,header=false
 const data:Buffer[]=[]
 while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);if(length>bytes.length-offset-12)return fail();const chunk=bytes.subarray(offset+8,offset+8+length);let crc=0xffffffff;for(const value of bytes.subarray(offset+4,offset+8+length)){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}if(((crc^0xffffffff)>>>0)!==bytes.readUInt32BE(offset+8+length))return fail()
  if(type==='IHDR'){if(header||offset!==8||length!==13)return fail();header=true;width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);channels=chunk[9]===6?4:chunk[9]===2?3:0;if(!width||!height||width>4096||height>4096||width*height>8000000||chunk[8]!==8||!channels||chunk[10]||chunk[11]||chunk[12])return fail()}
  else if(type==='IDAT'){if(!header||ended)return fail();data.push(chunk)}
  else if(type==='IEND'){if(length||!data.length)return fail();ended=true;offset+=12;break}
  else if(!['sBIT','sRGB','gAMA','cHRM','pHYs','tEXt'].includes(type))return fail()
  offset+=length+12
 }
 if(!ended||offset!==bytes.length)return fail()
 const row=width*channels+1,expected=row*height
 let raw:Buffer;try{raw=inflateSync(Buffer.concat(data),{maxOutputLength:expected+1})}catch{return fail()}
 if(raw.length!==expected)return fail()
 for(let y=0;y<height;y++)if(raw[y*row]!>4)return fail()
 return {width,height}
}
