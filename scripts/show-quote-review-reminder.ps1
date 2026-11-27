param(
  [string]$ReportPath='',
  [ValidateSet('success','partial','unavailable','missed')][string]$Status='partial',
  [switch]$Test,
  [switch]$NoOpen
)
$ErrorActionPreference='Stop'
$resolvedReport=$null
if($ReportPath){try{$resolvedReport=(Resolve-Path -LiteralPath $ReportPath).Path}catch{$Status='unavailable'}}
if($resolvedReport -and [IO.Path]::GetExtension($resolvedReport) -ne '.html'){$resolvedReport=$null;$Status='unavailable'}
$title=if($Test){'PCR - reminder test'}else{'PCR - quote review reminder'}
$statusText=switch($Status){
  'success' {'Quotes saved. Return to the original Codex chat for review.'}
  'partial' {'Quotes saved with missing data or timestamp warnings. Return to Codex to review.'}
  'unavailable' {'Quotes could not be obtained. Return to Codex for a manual review.'}
  'missed' {'The scheduled quote capture window was missed. No later prices were labelled as scheduled-time quotes.'}
}
$opened=$false
if(-not $NoOpen -and $resolvedReport){try{Start-Process -FilePath $resolvedReport;$opened=$true}catch{}}
$location=if($resolvedReport){$resolvedReport}else{'The report could not be saved or opened. Check the local task configuration.'}
$message=$statusText+"`r`n`r`n"+'No orders were placed.'+"`r`n`r`n"+$location
$shell=New-Object -ComObject WScript.Shell
$seconds=if($Test){8}else{60}
$response=$shell.Popup($message,$seconds,$title,64)
[pscustomobject]@{Status=$Status;Test=[bool]$Test;PopupReturned=$response;Opened=$opened;ReportPath=$resolvedReport} | ConvertTo-Json -Compress
