import http from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLocalD1} from './local-db.mjs';
import {createMoomooClient,createMoomooLocalHandler} from './moomoo-client.mjs';
import {readLocalMoomooKey} from './local-secrets.mjs';
const {default:worker}=await import(pathToFileURL(resolve('dist/server/index.js')));
const database=await createLocalD1();
const environment={DB:database,WATCHLIST_STORAGE:'local'};
let localMoomooKey='';
try {localMoomooKey=await readLocalMoomooKey()||'';} catch {console.warn('Local moomoo credentials unavailable; PCR remains available');}
const moomooHandler=createMoomooLocalHandler(createMoomooClient({appKey:localMoomooKey}));
const port=Number(process.env.PCR_PREVIEW_PORT||8765);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');
const origin='http://127.0.0.1:'+port;
const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers);if(['/api/watchlist-settings','/api/market-pcr-settings'].includes(new URL(req.url,origin).pathname))headers.set('oai-authenticated-user-id','local_user');const request=new Request(origin+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await moomooHandler(request)||await worker.fetch(request,environment, {waitUntil(p){p.catch(()=>{});}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(500);res.end(String(error));}});
server.listen(port,'127.0.0.1',()=>console.log('PCR preview: '+origin));
