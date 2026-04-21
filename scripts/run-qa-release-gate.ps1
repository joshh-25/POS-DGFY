param(
  [string]$EnvFile = '.env.qa.local'
)

$ErrorActionPreference = 'Stop'

& "$PSScriptRoot\load-qa-env.ps1" -EnvFile $EnvFile
npm run gate:release:no-staging
