import test from 'node:test'
import assert from 'node:assert/strict'
import {InkInput} from '../../frontend/src/ink/input.js'
test('cancel and competing pointers discard incomplete input',()=>{
 const input=new InkInput()
 assert.equal(input.begin(1,{x:1,y:2}),true)
 input.move(2,{x:100,y:200})
 input.cancel()
 assert.deepEqual(input.end(1),[])
 input.begin(1,{x:1,y:2})
 assert.equal(input.begin(2,{x:20,y:30}),false)
 assert.deepEqual(input.end(1),[])
 input.begin(3,{x:3,y:4})
 assert.deepEqual(input.end(3),[{x:3,y:4}])
})
