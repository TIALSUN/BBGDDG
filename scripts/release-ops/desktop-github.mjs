import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertReleaseTag} from './release-tag.mjs';
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
if(credential.status!==0)throw Error('GitHub credential unavailable; no credential values printed.');
const token=credential.stdout.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
if(!token)throw Error('GitHub authentication unavailable');
const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'BBGDDG-desktop-release'};
const api='https://api.github.com/repos/TIALSUN/BBGDDG';
const version=process.argv[3]||JSON.parse(fs.readFileSync('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid release version');
const tagName=`v${version}`;
async function request(url,options={}){const response=await fetch(url,{...options,headers:{...headers,...options.headers}});if(!response.ok)throw Error(`GitHub request failed: ${response.status} ${new URL(url).pathname}`);return response.json()}
function releaseSha(){const result=spawnSync('git',['rev-parse',`${tagName}^{commit}`],{encoding:'utf8',windowsHide:true});const sha=result.stdout.trim();if(result.status!==0||!/^[0-9a-f]{40}$/.test(sha))throw Error('Expected local release commit unavailable');return sha}
const checkTag=sha=>assertReleaseTag(suffix=>request(api+suffix),tagName,sha);
const mode=process.argv[2]||'inspect';
if(mode==='inspect'){
 const latest=await request(`${api}/releases/latest`),repo=await request(api);
 console.log(JSON.stringify({latest:latest.tag_name,url:latest.html_url,assets:latest.assets.map(a=>({name:a.name,size:a.size})),pushPermission:repo.permissions?.push}));
}else if(mode==='publish'){
 const sha=releaseSha();await checkTag(sha);
 const list=JSON.parse(fs.readFileSync('release/upload-files.json','utf8'));
 const notes=fs.readFileSync(`docs/RELEASE-${version}.md`,'utf8');
 const expectedNames=['Setup.exe','Portable.zip','SHA256.txt'].map(suffix=>`BBGDDG-${version}-${suffix}`).sort();
 if(JSON.stringify(list.map(file=>path.basename(file)).sort())!==JSON.stringify(expectedNames))throw Error('Release assets do not match requested version');
 const existing=await fetch(`${api}/releases/tags/${tagName}`,{headers});if(existing.status!==404)throw Error('Release already exists or tag lookup failed; refusing overwrite.');
 const release=await request(`${api}/releases`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tagName,target_commitish:sha,name:`BBGDDG ${version}`,body:notes,draft:true,prerelease:false})});
 fs.writeFileSync('release/github-release-id.txt',String(release.id));
 for(const file of list){const bytes=fs.readFileSync(file),name=path.basename(file),checksum=createHash('sha256').update(bytes).digest('hex'),asset=await request(release.upload_url.replace(/\{.*\}$/,'')+`?name=${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':name.endsWith('.zip')?'application/zip':'application/octet-stream'},body:bytes});if(asset.size!==bytes.length||asset.digest!==`sha256:${checksum}`)throw Error('Uploaded asset digest mismatch: '+name);console.log(JSON.stringify({uploaded:name,size:asset.size,sha256:checksum}));}
 await checkTag(sha);
 const published=await request(`${api}/releases/${release.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,make_latest:'true'})});await checkTag(sha);console.log(JSON.stringify({published:published.html_url,tag:published.tag_name}));
}else if(mode==='verify'){
 const release=await request(`${api}/releases/tags/${tagName}`);const sha=releaseSha();await checkTag(sha);
 if(release.draft)throw Error('Release remains draft');
 const local=JSON.parse(fs.readFileSync('release/upload-files.json','utf8'));
 for(const file of local){const checksum=createHash('sha256').update(fs.readFileSync(file)).digest('hex'),asset=release.assets.find(a=>a.name===path.basename(file));if(!asset||asset.digest!==`sha256:${checksum}`)throw Error('Remote asset mismatch');}
 console.log(JSON.stringify({url:release.html_url,draft:release.draft,commit:sha,assets:release.assets.map(a=>({name:a.name,size:a.size,digest:a.digest}))}));
}else throw Error('Unsupported release action');
