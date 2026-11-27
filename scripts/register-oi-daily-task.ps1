param(
  [Parameter(Mandatory=$true)][string]$DatabasePath,
  [string]$NodePath=(Get-Command node -ErrorAction Stop).Source,
  [switch]$DryRun
)
$ErrorActionPreference='Stop'
Import-Module ScheduledTasks -ErrorAction Stop
if((Get-TimeZone).Id -ne 'Eastern Standard Time'){throw 'This task requires the Windows Eastern time zone so 17:30 follows New York daylight saving time.'}
$resolvedNode=(Resolve-Path -LiteralPath $NodePath).Path
$resolvedDatabase=(Resolve-Path -LiteralPath $DatabasePath).Path
$runner=Join-Path $PSScriptRoot 'run-oi-daily-task.ps1'
$powerShellPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskName='PCR-OI-Daily-Snapshot'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$runner+'" -NodePath "'+$resolvedNode+'" -DatabasePath "'+$resolvedDatabase+'"'
$details=[ordered]@{TaskName=$taskName;Schedule='Every day 17:30 America/New_York';UserLoggedOnRequired=$true;RunLevel='Limited';DryRun=[bool]$DryRun}
if($DryRun){$details|ConvertTo-Json;exit 0}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$existing=Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if($existing){
  $ownerSid=$existing.Principal.UserId
  if($ownerSid -notmatch '^S-1-'){try{$ownerSid=(New-Object Security.Principal.NTAccount($ownerSid)).Translate([Security.Principal.SecurityIdentifier]).Value}catch{$ownerSid=$null}}
  if(@($existing.Actions).Count -ne 1 -or $existing.Actions.Execute -ne $powerShellPath -or $existing.Actions.Arguments -ne $arguments -or $ownerSid -ne $identity -or [string]$existing.Principal.RunLevel -ne 'Limited' -or [string]$existing.Principal.LogonType -ne 'Interactive'){throw 'An existing daily OI task differs. Inspect it before replacing it.'}
  $details['Registration']='already-present'
}else{
  $action=New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
  $trigger=New-ScheduledTaskTrigger -Daily -At '17:30'
  # An offset-free wall-clock trigger follows the machine's checked Eastern zone.
  $trigger.StartBoundary=([DateTime]::Today.AddHours(17).AddMinutes(30)).ToString("yyyy-MM-dd'T'HH:mm:ss")
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)
  $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Daily quote-only OI snapshot of the current PCR watchlist. Private SQLite archive, no orders or account queries.'|Out-Null
  $details['Registration']='created'
}
$task=Get-ScheduledTask -TaskName $taskName -TaskPath '\';$info=Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
$details['State']=[string]$task.State;$details['NextRunAt']=$info.NextRunTime.ToUniversalTime().ToString('o')
$details|ConvertTo-Json
