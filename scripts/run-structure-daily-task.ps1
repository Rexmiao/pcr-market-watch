param([Parameter(Mandatory=$true)][string]$NodePath,[Parameter(Mandatory=$true)][string]$DatabasePath)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:PCR_RUNTIME='local'
& $NodePath (Join-Path $PSScriptRoot 'structure-archive.mjs') '--database' $DatabasePath '--mode' 'scheduled'
exit $LASTEXITCODE
