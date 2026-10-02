import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../dist/core/config.js';
import { buildServer } from '../../dist/server/app.js';
// This deterministic token is restricted to the isolated E2E test server.
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bbgddg-e2e-'));
const server=await buildServer(loadConfig({dataDir,port:8201}),{accessToken:'e'.repeat(64)});
await server.listen({host:'127.0.0.1',port:8201});
let closed=false;
async function close(){if(closed)return;closed=true;await server.close();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0);}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
