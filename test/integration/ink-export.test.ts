import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs'
import {createCanvas} from '@napi-rs/canvas'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {PDFDocument,degrees} from 'pdf-lib'
import {testConfig,testDb,createProject,createSource,cleanup} from '../helpers/test-utils.js'
import {InkService} from '../../src/core/ink.js'
test('PDF export preserves original bytes, rotation, crop and page count',async()=>{
 const module=await import('../../src/core/ink-export.js').catch(()=>null)
 assert.ok(module,'annotated exporter missing')
 const config=testConfig(),db=testDb(config)
 try{
  const project=createProject(db),source=createSource(db,project)
  const pdf=await PDFDocument.create(),page=pdf.addPage([400,600]);page.setCropBox(20,30,300,500);page.setRotation(degrees(90))
  const bytes=await pdf.save(),hash=createHash('sha256').update(bytes).digest('hex'),filename='export-test.pdf'
  fs.writeFileSync(path.join(config.filesDir,filename),bytes)
  db.prepare('UPDATE sources SET local_path=?,content_hash=? WHERE id=?').run(filename,hash,source)
  new InkService(db).save(project,{version:1,revision:0,target:{kind:'pdf',sourceId:source,page:1,contentHash:hash},blocks:[{id:'b',height:500,background:'blank',strokes:[{id:'s',tool:'marker',color:'#e9c76b',width:2,points:[{x:40,y:60},{x:80,y:100}]}]}]},0)
  const output=await module.exportAnnotatedPdf(db,config,project,source)
  const exported=await PDFDocument.load(output)
  assert.equal(exported.getPageCount(),1)
  assert.equal(exported.getPage(0).getRotation().angle,90)
  assert.deepEqual(exported.getPage(0).getCropBox(),{x:20,y:30,width:300,height:500})
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(config.filesDir,filename))).digest('hex'),hash)
  const parsed=await getDocument({data:new Uint8Array(output)}).promise;try{const rasterPage=await parsed.getPage(1),viewport=rasterPage.getViewport({scale:1}),canvas=createCanvas(viewport.width,viewport.height),context=canvas.getContext('2d');await rasterPage.render({canvas:canvas as never,canvasContext:context as never,viewport}).promise;const pixel=context.getImageData(50,40,1,1).data;assert.ok(pixel[0]>240&&pixel[1]>220&&pixel[2]<235,`Expected warm transparent marker at native coordinates, got ${pixel}`);const outside=context.getImageData(200,200,1,1).data;assert.ok(outside[0]===255&&outside[1]===255&&outside[2]===255);if(process.env.BBGDDG_VALIDATION_ARTIFACTS)fs.writeFileSync('docs/validation/pdf-export-rotation.png',canvas.toBuffer('image/png'))}finally{await parsed.destroy()}
  await assert.rejects(()=>module.exportAnnotatedPdf(db,config,createProject(db),source))
 }finally{cleanup(config,db)}
})
