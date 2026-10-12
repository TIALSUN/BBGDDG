import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReleaseTag} from './release-tag.mjs';
const expected='a'.repeat(40),other='b'.repeat(40),tag='c'.repeat(40);
test('lightweight tag binds to expected commit',async()=>assert.equal(await assertReleaseTag(async()=>({object:{type:'commit',sha:expected}}),'v1.3.0',expected),expected));
test('annotated tag resolves to commit',async()=>assert.equal(await assertReleaseTag(async url=>url.startsWith('/git/ref/')?{object:{type:'tag',sha:tag}}:{object:{type:'commit',sha:expected}},'v1.3.0',expected),expected));
test('wrong commit is rejected before publication',async()=>assert.rejects(assertReleaseTag(async()=>({object:{type:'commit',sha:other}}),'v1.3.0',expected),/Tag commit mismatch/));
test('missing tag is rejected before publication',async()=>assert.rejects(assertReleaseTag(async()=>null,'v1.3.0',expected),/Missing release tag/));
test('invalid expected SHA and cyclic tag are rejected',async()=>{await assert.rejects(assertReleaseTag(async()=>null,'v1.3.0',''),/Invalid expected/);await assert.rejects(assertReleaseTag(async()=>({object:{type:'tag',sha:tag}}),'v1.3.0',expected),/Cyclic/)});
