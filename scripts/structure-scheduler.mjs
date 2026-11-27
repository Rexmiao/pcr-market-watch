// Safe Windows scheduler metadata only. This function never creates a task.
import {spawn} from 'node:child_process';
export function windowsStructureTaskStatus(){
  if(process.platform!=='win32')return Promise.resolve({available:false,state:'not_supported'});
  return new Promise(resolve=>{
    const script="$ErrorActionPreference='Stop';try{$t=Get-ScheduledTask -TaskName 'PCR-Structure-Daily-Snapshot' -TaskPath '\\';$i=Get-ScheduledTaskInfo -TaskName 'PCR-Structure-Daily-Snapshot' -TaskPath '\\';[ordered]@{available=$true;state=[string]$t.State;nextRunAt=if($i.NextRunTime.Year -gt 2000){$i.NextRunTime.ToUniversalTime().ToString('o')}else{$null};lastRunAt=if($i.LastRunTime.Year -gt 2000){$i.LastRunTime.ToUniversalTime().ToString('o')}else{$null};lastTaskResult=$i.LastTaskResult;kind='windows_task'}|ConvertTo-Json -Compress}catch{'{\"available\":false,\"state\":\"not_found\"}'}";
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['ignore','pipe','ignore']});let output='',done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish({available:false,state:'unavailable'});},10000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>8192){child.kill();finish({available:false,state:'unavailable'});}});
    child.on('error',()=>finish({available:false,state:'unavailable'}));
    child.on('close',()=>{try{finish(JSON.parse(output));}catch{finish({available:false,state:'unavailable'});}});
  });
}
