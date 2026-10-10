import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvas} from '@napi-rs/canvas'
test('PNG validation decodes bounded image data and rejects disguised and corrupted files',async()=>{
 const module=await import('../../src/core/ink-png.js').catch(()=>null)
 assert.ok(module,'PNG validator missing')
 const png=createCanvas(20,10).toBuffer('image/png')
 assert.deepEqual(module.validatePng(png),{width:20,height:10})
 assert.throws(()=>module.validatePng(Buffer.from('<html>bad</html>')))
 const bad=Buffer.from(png);bad[bad.length-5]^=1
 assert.throws(()=>module.validatePng(bad))
})
