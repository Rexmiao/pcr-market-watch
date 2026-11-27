param(
  [Parameter(Mandatory=$true)][string]$DatabasePath,
  [string]$NodePath=(Get-Command node -ErrorAction Stop).Source,
  [switch]$DryRun
)
$ErrorActionPreference='Stop'
Import-Module ScheduledTasks -ErrorAction Stop
if((Get-TimeZone).Id -ne 'Eastern Standard Time'){throw 'The 17:45 task requires the Windows Eastern time zone to follow New York daylight saving time.'}
$resolvedNode=(Resolve-Path -LiteralPath $NodePath).Path
$resolvedDatabase=(Resolve-Path -LiteralPath $DatabasePath).Path
$runner=Join-Path $PSScriptRoot 'run-structure-daily-task.ps1'
if(!(Test-Path -LiteralPath $runner -PathType Leaf)){throw 'The daily structure runner is missing'}
$powerShellPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskName='PCR-Structure-Daily-Snapshot'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$runner+'" -NodePath "'+$resolvedNode+'" -DatabasePath "'+$resolvedDatabase+'"'
$details=[ordered]@{TaskName=$taskName;Schedule='Every day 17:45 America/New_York';UserLoggedOnRequired=$true;RunLevel='Limited';DryRun=[bool]$DryRun}
if($DryRun){$details|ConvertTo-Json;exit 0}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$existing=Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if($existing){
  $ownerSid=$existing.Principal.UserId
  if($ownerSid -notmatch '^S-1-'){try{$ownerSid=(New-Object Security.Principal.NTAccount($ownerSid)).Translate([Security.Principal.SecurityIdentifier]).Value}catch{$ownerSid=$null}}
  if(@($existing.Actions).Count -ne 1 -or $existing.Actions.Execute -ne $powerShellPath -or $existing.Actions.Arguments -ne $arguments -or $ownerSid -ne $identity -or [string]$existing.Principal.RunLevel -ne 'Limited' -or [string]$existing.Principal.LogonType -ne 'Interactive'){throw 'An existing task differs. Inspect it before replacement.'}
  $details['Registration']='already-present'
}else{
  $action=New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
  $trigger=New-ScheduledTaskTrigger -Daily -At '17:45'
  $trigger.StartBoundary=([DateTime]::Today.AddHours(17).AddMinutes(45)).ToString("yyyy-MM-dd'T'HH:mm:ss")
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)
  $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Daily quote-only Gamma and Max Pain archive for published PCR symbols and actual expirations within 30 days. Private SQLite, no account or trading queries.' | Out-Null
  $details['Registration']='created'
}
& $resolvedNode (Join-Path $PSScriptRoot 'structure-archive.mjs') '--database' $resolvedDatabase '--register-only' 'true'
if($LASTEXITCODE -ne 0){throw 'The Windows task exists but its archive activation record could not be saved'}
$task=Get-ScheduledTask -TaskName $taskName -TaskPath '\';$info=Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
$details['State']=[string]$task.State;$details['NextRunAt']=$info.NextRunTime.ToUniversalTime().ToString('o')
$details|ConvertTo-Json
