export async function assertReleaseTag(get,tag,expected){
 if(!/^[0-9a-f]{40}$/.test(expected))throw Error('Invalid expected release SHA');
 const ref=await get(`/git/ref/tags/${encodeURIComponent(tag)}`);
 if(!ref)throw Error('Missing release tag');
 let object=ref.object;const seen=new Set();
 for(let depth=0;depth<8;depth++){
  if(!object||!/^[0-9a-f]{40}$/.test(object.sha))throw Error('Invalid remote tag object');
  if(object.type==='commit'){if(object.sha!==expected)throw Error('Tag commit mismatch');return object.sha}
  if(object.type!=='tag')throw Error('Unsupported tag target');
  if(seen.has(object.sha))throw Error('Cyclic tag reference');seen.add(object.sha);
  object=(await get(`/git/tags/${object.sha}`))?.object;
 }
 throw Error('Tag nesting exceeds safe limit');
}
