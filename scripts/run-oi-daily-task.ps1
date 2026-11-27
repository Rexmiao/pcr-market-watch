param([Parameter(Mandatory=$true)][string]$NodePath,[Parameter(Mandatory=$true)][string]$DatabasePath)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& $NodePath (Join-Path $PSScriptRoot 'oi-daily.mjs') '--database' $DatabasePath '--mode' 'scheduled'
exit $LASTEXITCODE
