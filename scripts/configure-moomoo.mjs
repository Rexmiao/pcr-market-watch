import {saveLocalMoomooKey,readLocalMoomooKey} from './local-secrets.mjs';
import {createMoomooClient} from './moomoo-client.mjs';
if(process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stderr.write('Enter the moomoo AppKey (hidden), then Enter:\n');
const key=await new Promise((resolve,reject)=>{
  let value='';
  process.stdin.on('data',chunk=>{
    if(chunk.includes('\u0003')){reject(Error('Cancelled.'));process.stdin.pause();return;}
    for(const char of chunk){if(char==='\b'||char==='\u007f')value=value.slice(0,-1);else value+=char;}
    if(/[\r\n]/.test(value)){if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();resolve(value.trim());}
  });
});
try {
  await saveLocalMoomooKey(key);
  if(await readLocalMoomooKey()!==key)throw Error('Credential verification failed.');
  const client=createMoomooClient({appKey:key});
  const data=await client.quotes('AMD,NVDA');
  console.log(JSON.stringify({configured:true,readOnly:true,storage:'Windows user DPAPI, outside the project',checkedAt:data.checkedAt,symbols:data.symbols}));
}catch(error){console.error(String(error.message).replaceAll(key,'[redacted]'));process.exitCode=1;}
