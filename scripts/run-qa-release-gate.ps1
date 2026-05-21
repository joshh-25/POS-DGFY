param(
  [string]$EnvFile = '.env.qa.local',
  [string]$SecretsFile = '.env.qa.secrets.local'
)

$ErrorActionPreference = 'Stop'

& "$PSScriptRoot\load-qa-env.ps1" -EnvFile $EnvFile -SecretsFile $SecretsFile
npm run gate:release:no-staging
exit $LASTEXITCODE
