param(
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [string]$NodePath=(Get-Command node -ErrorAction Stop).Source,
  [switch]$DryRun
)
$ErrorActionPreference='Stop'
Import-Module ScheduledTasks -ErrorAction Stop
$resolvedConfig=(Resolve-Path -LiteralPath $ConfigPath).Path
$resolvedNode=(Resolve-Path -LiteralPath $NodePath).Path
$captureScript=Join-Path $PSScriptRoot 'capture-quote-review.mjs'
$runnerScript=Join-Path $PSScriptRoot 'run-quote-review-task.ps1'
$validation=& $resolvedNode $captureScript '--config' $resolvedConfig '--dry-run'
if($LASTEXITCODE -ne 0){throw 'Invalid quote review configuration.'}
$config=Get-Content -LiteralPath $resolvedConfig -Raw -Encoding UTF8 | ConvertFrom-Json
$scheduled=[DateTimeOffset]::Parse($config.scheduledAt).ToUniversalTime()
if($scheduled -le [DateTimeOffset]::UtcNow){throw 'The scheduled time must be in the future.'}
$taskName='PCR-QuoteReview-'+$config.jobId
$powerShellPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$runnerScript+'" -NodePath "'+$resolvedNode+'" -ConfigPath "'+$resolvedConfig+'"'
$description='One-time, quote-only local market review. Saves private files and displays a reminder. No accounts or orders.'
$details=[ordered]@{TaskName=$taskName;ScheduledUtc=$scheduled.ToString('o');ScheduledMarket=$config.scheduledAt;Cutoff=$config.cutoffAt;UserLoggedOnRequired=$true;RunLevel='Limited';WakeToRun=$true;CatchUpEndUtc=$scheduled.AddDays(1).ToString('o');ConfigPath=$resolvedConfig;Action=$powerShellPath;Arguments=$arguments;DryRun=[bool]$DryRun}
if($DryRun){$details | ConvertTo-Json -Depth 3;exit 0}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$existing=Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if($existing){
  $ownerSid=$existing.Principal.UserId
  if($ownerSid -notmatch '^S-1-'){try{$ownerSid=(New-Object Security.Principal.NTAccount($ownerSid)).Translate([Security.Principal.SecurityIdentifier]).Value}catch{$ownerSid=$null}}
  $sameOwner=$ownerSid -eq $identity
  if(@($existing.Actions).Count -ne 1 -or @($existing.Triggers).Count -ne 1 -or $existing.Actions.Execute -ne $powerShellPath -or $existing.Actions.Arguments -ne $arguments -or [DateTimeOffset]::Parse($existing.Triggers.StartBoundary).ToUniversalTime() -ne $scheduled -or [DateTimeOffset]::Parse($existing.Triggers.EndBoundary).ToUniversalTime() -ne $scheduled.AddDays(1) -or -not $sameOwner -or [string]$existing.Principal.LogonType -ne 'Interactive' -or [string]$existing.Principal.RunLevel -ne 'Limited' -or -not $existing.Settings.StartWhenAvailable -or -not $existing.Settings.WakeToRun -or $existing.Settings.DisallowStartIfOnBatteries -or $existing.Settings.StopIfGoingOnBatteries -or $existing.Settings.RunOnlyIfNetworkAvailable -or [string]$existing.Settings.MultipleInstances -ne 'IgnoreNew' -or -not $existing.Settings.Enabled){throw 'An existing task differs. Inspect it before replacing it.'}
  $details['Registration']='already-present';$details | ConvertTo-Json -Depth 3;exit 0
}
$action=New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger=New-ScheduledTaskTrigger -Once -At $scheduled.LocalDateTime
$trigger.StartBoundary=$scheduled.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
$trigger.EndBoundary=$scheduled.AddDays(1).UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $description | Out-Null
$task=Get-ScheduledTask -TaskName $taskName -TaskPath '\'
$info=Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
$details['Registration']='created';$details['State']=[string]$task.State;$details['NextRunTimeLocal']=$info.NextRunTime.ToString('o')
$details | ConvertTo-Json -Depth 3
