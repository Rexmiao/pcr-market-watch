// Creates a fresh, reviewed source-only upload folder. No Git, HF login, upload,
// billing, private database migration, or credential export is performed.
import {copyFile,lstat,mkdir,readdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,extname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const inside=(parent,path)=>{const value=relative(parent,path);return value===''||!value.startsWith('..')&&!isAbsolute(value);};
const denied=/^(?:\.env(?:\..*)?|.*\.(?:sqlite(?:3)?(?:-.*)?|db(?:-.*)?|dpapi|log|pem|key)|config\.json)$/i;
const roots=['Dockerfile','.dockerignore','.gitignore','package.json','package-lock.json','LICENSE','AGENTS.md','README.en.md','README.zh-CN.md','start.cmd','start-local.mjs','drizzle.config.ts','.openai/hosting.json','deploy/huggingface/README.md','site/assets/dashboard.png','site/assets/history.png','site/assets/demo.gif'];
const dirs={scripts:new Set(['.mjs','.py','.ps1']),worker:new Set(['.js']),web:new Set(['.html','.js','.css','.json']),drizzle:new Set(['.sql','.json']),docs:new Set(['.md']),db:new Set(['.ts'])};

export async function prepareHfSource(outputDirectory){
  if(typeof outputDirectory!=='string'||!isAbsolute(outputDirectory))throw Error('HF_OUTPUT_MUST_BE_ABSOLUTE');
  const output=resolve(outputDirectory);
  if(inside(source,output)||inside(output,source))throw Error('HF_OUTPUT_MUST_BE_SEPARATE');
  await mkdir(output,{recursive:true});
  const stat=await lstat(output);
  if(!stat.isDirectory()||stat.isSymbolicLink()||resolve(await realpath(output))!==output||(await readdir(output)).length)throw Error('HF_OUTPUT_MUST_BE_EMPTY');
  const selected=[...roots,'data/seed.json','data/cboe-seed.json','data/market-brief.json'];
  async function collect(directory,prefix,extensions){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      if(entry.isSymbolicLink()||denied.test(entry.name))throw Error('HF_UNEXPECTED_PRIVATE_OR_LINK_FILE');
      if(entry.name.startsWith('.')||['node_modules','local-data','qa','release'].includes(entry.name))continue;
      const rel=prefix+'/'+entry.name;
      if(entry.isDirectory())await collect(join(directory,entry.name),rel,extensions);
      else if(entry.isFile()&&extensions.has(extname(entry.name))&&rel!=='worker/assets.generated.js')selected.push(rel);
    }
  }
  for(const [directory,extensions]of Object.entries(dirs))await collect(join(source,directory),directory,extensions);
  const manifest=[];
  for(const name of selected.sort()){
    const from=join(source,name),info=await lstat(from);
    if(!info.isFile()||info.isSymbolicLink()||resolve(await realpath(from))!==resolve(from))throw Error('HF_UNEXPECTED_SOURCE_FILE');
    const target=join(output,name);await mkdir(dirname(target),{recursive:true});await copyFile(from,target);
    manifest.push({path:name,bytes:info.size,sha256:createHash('sha256').update(await readFile(from)).digest('hex')});
  }
  const spaceReadme=Buffer.from((await readFile(join(source,'deploy/huggingface/README.md'),'utf8')).replaceAll('](../../docs/','](docs/'));
  await writeFile(join(output,'README.md'),spaceReadme,{flag:'wx'});
  manifest.push({path:'README.md',bytes:spaceReadme.length,sha256:createHash('sha256').update(spaceReadme).digest('hex')});
  await writeFile(join(output,'SOURCE_MANIFEST.json'),JSON.stringify({schemaVersion:1,preparedAt:new Date().toISOString(),files:manifest},null,2)+'\n',{flag:'wx'});
  return {prepared:true,files:manifest.length,bytes:manifest.reduce((total,item)=>total+item.bytes,0),uploaded:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==4||process.argv[2]!=='--output')throw Error('Usage: node scripts/hf-prepare.mjs --output ABSOLUTE_EMPTY_DIRECTORY');
    console.log(JSON.stringify(await prepareHfSource(process.argv[3])));
  }catch(error){console.error(/^(?:HF_|Usage:)/.test(error.message)?error.message:'HF_PREPARATION_FAILED');process.exitCode=1;}
}
