param(
  [string]$EnvFile = '.env.prod.local'
)

$ErrorActionPreference = 'Stop'

& "$PSScriptRoot\load-prod-env.ps1" -EnvFile $EnvFile
npm run gate:release:prod-contracts
