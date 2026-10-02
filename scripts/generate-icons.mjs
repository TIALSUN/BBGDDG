import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Original geometric book mark for BBGDDG; no external image assets or fonts.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#13151a"/><path d="M118 136h110q28 0 28 28v216q-18-28-50-28h-88zM394 136H284q-28 0-28 28v216q18-28 50-28h88z" fill="#84baa8"/><path d="M156 200h58m-58 50h58m84-50h58m-58 50h58" stroke="#13151a" stroke-width="18" stroke-linecap="round"/><path d="M256 176v164" stroke="#13151a" stroke-width="12"/></svg>`;
fs.writeFileSync(path.join(repo, 'frontend/public/favicon.svg'), svg);
function draw(size) {
  const canvas = createCanvas(size, size), ctx = canvas.getContext('2d');
  ctx.scale(size / 512, size / 512);
  ctx.fillStyle = '#13151a'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 512, 112); ctx.fill();
  ctx.fillStyle = '#84baa8';
  ctx.beginPath();ctx.moveTo(118,136);ctx.lineTo(228,136);ctx.quadraticCurveTo(256,136,256,164);ctx.lineTo(256,380);ctx.quadraticCurveTo(238,352,206,352);ctx.lineTo(118,352);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(394,136);ctx.lineTo(284,136);ctx.quadraticCurveTo(256,136,256,164);ctx.lineTo(256,380);ctx.quadraticCurveTo(274,352,306,352);ctx.lineTo(394,352);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#13151a';ctx.lineWidth=18;ctx.lineCap='round';
  for(const[x,y]of[[156,200],[156,250],[298,200],[298,250]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+58,y);ctx.stroke();}
  ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(256,176);ctx.lineTo(256,340);ctx.stroke();return canvas;
}
for(const[size,name]of[[512,'icon-512.png'],[192,'icon-192.png'],[32,'favicon-32.png'],[16,'favicon-16.png'],[256,'logo.png']])fs.writeFileSync(path.join(repo,'frontend/public',name),draw(size).toBuffer('image/png'));
fs.writeFileSync(path.join(repo,'frontend/public/favicon.jpg'),draw(256).toBuffer('image/jpeg'));
fs.writeFileSync(path.join(repo,'desktop/assets/icon.png'),draw(512).toBuffer('image/png'));
console.log('BBGDDG icons generated.');
