// This file contains no credentials. Windows DPAPI binds the saved key to this
// Windows user. The encrypted file stays outside the project and Dropbox.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

function secretPath() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return null;
  return join(process.env.LOCALAPPDATA,'PcrMarketWatch','moomoo-appkey.dpapi');
}
function powershell(command, input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{
      windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],
      env:{...process.env,PSModulePath:join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules'),PCR_MOOMOO_SECRET_PATH:secretPath()},
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
