// This file contains no credentials. Windows DPAPI binds the saved key to this
// Windows user. The encrypted file stays outside the project and Dropbox.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

function secretPath(kind='desktop') {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return null;
  const file=kind==='desktop'?'moomoo-appkey.dpapi':kind==='webapi'?'moomoo-webapi-oauth.dpapi':null;
  if(!file)throw Error('Unknown local credential type.');
  return join(process.env.LOCALAPPDATA,'PcrMarketWatch',file);
}
function powershell(command, input='',kind='desktop') {
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{
      windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],
      env:{...process.env,PSModulePath:join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules'),PCR_MOOMOO_SECRET_PATH:secretPath(kind)},
    });
    const output=[]; let finished=false;
    const timer=setTimeout(()=>{child.kill();done(Error('Local credential access timed out.'));},10000);
    function done(error,value){if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);}
    child.on('error',()=>done(Error('Windows credential storage is unavailable.')));
    child.stdout.on('data',chunk=>output.push(chunk));
    // Do not expose provider output or credentials through diagnostics.
    child.stderr.resume();
    child.on('close',code=>code===0?done(null,Buffer.concat(output).toString('utf8').trim()):done(Error('The saved moomoo key could not be accessed by this Windows user.')));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export async function readLocalMoomooKey() {
  if (process.env.OPENAPI_HOST_APPKEY) return process.env.OPENAPI_HOST_APPKEY.trim();
  const path=secretPath(); if(!path || !existsSync(path)) return '';
  return await powershell('$ErrorActionPreference="Stop"; $value=Get-Content -LiteralPath $env:PCR_MOOMOO_SECRET_PATH -Raw; $secure=ConvertTo-SecureString $value; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }');
}
export async function saveLocalMoomooKey(key) {
  if(!secretPath()) throw Error('Windows user credential storage is required.');
  if(typeof key!=='string' || !/^[A-Za-z0-9_-]{16,256}$/.test(key)) throw Error('Invalid moomoo AppKey.');
  await powershell('$ErrorActionPreference="Stop"; $value=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString $value -AsPlainText -Force; $encoded=ConvertFrom-SecureString $secure; $directory=Split-Path -Parent $env:PCR_MOOMOO_SECRET_PATH; [IO.Directory]::CreateDirectory($directory)|Out-Null; [IO.File]::WriteAllText($env:PCR_MOOMOO_SECRET_PATH,$encoded)',key);
}

export function hasLocalMoomooWebApiCredentials(){
  const path=secretPath('webapi');return Boolean(path&&existsSync(path));
}
function webApiBundle(value){
  const token=v=>typeof v==='string'&&v.length>0&&v.length<=8192&&/^[A-Za-z0-9._~+\/-]+=*$/.test(v);
  if(!value||typeof value!=='object'||Array.isArray(value)||!token(value.accessToken)||!token(value.refreshToken)||typeof value.clientId!=='string'||!/^[A-Za-z0-9._-]{1,256}$/.test(value.clientId)||value.scope!=='quote:read'||!Number.isFinite(value.expiresAt)||value.expiresAt<=0)throw Error('The saved moomoo WebAPI authorization has an invalid format.');
  return {accessToken:value.accessToken,refreshToken:value.refreshToken,clientId:value.clientId,expiresAt:value.expiresAt,scope:'quote:read',hasAccountContext:value.hasAccountContext===true,...(Number.isFinite(value.refreshExpiresAt)?{refreshExpiresAt:value.refreshExpiresAt}:{})};
}
export async function readLocalMoomooWebApiBundle(){
  if(!hasLocalMoomooWebApiCredentials())return null;
  const text=await powershell('$ErrorActionPreference="Stop"; $value=Get-Content -LiteralPath $env:PCR_MOOMOO_SECRET_PATH -Raw; $secure=ConvertTo-SecureString $value; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }','','webapi');
  try{return webApiBundle(JSON.parse(text));}catch{throw Error('The saved moomoo WebAPI authorization could not be read.');}
}
export async function saveLocalMoomooWebApiBundle(value){
  if(!secretPath('webapi'))throw Error('Windows user credential storage is required.');
  const text=JSON.stringify(webApiBundle(value));
  await powershell('$ErrorActionPreference="Stop"; $value=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString $value -AsPlainText -Force; $encoded=ConvertFrom-SecureString $secure; $directory=Split-Path -Parent $env:PCR_MOOMOO_SECRET_PATH; [IO.Directory]::CreateDirectory($directory)|Out-Null; [IO.File]::WriteAllText($env:PCR_MOOMOO_SECRET_PATH,$encoded)',text,'webapi');
}
