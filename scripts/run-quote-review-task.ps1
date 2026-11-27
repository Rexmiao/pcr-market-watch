param(
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [Parameter(Mandatory=$true)][string]$NodePath
)
$ErrorActionPreference='Stop'
$captureScript=Join-Path $PSScriptRoot 'capture-quote-review.mjs'
try{
  & $NodePath $captureScript '--config' $ConfigPath '--notify'
  exit $LASTEXITCODE
}catch{
  & (Join-Path $PSScriptRoot 'show-quote-review-reminder.ps1') -Status 'unavailable' -NoOpen
  exit 1
}
