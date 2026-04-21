param(
  [string]$EnvFile = '.env.qa.local'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "QA env file not found: $EnvFile"
}

Get-Content -LiteralPath $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ([string]::IsNullOrWhiteSpace($line)) { return }
  if ($line.StartsWith('#')) { return }

  $parts = $line.Split('=', 2)
  if ($parts.Count -ne 2) { return }

  $key = $parts[0].Trim()
  $value = $parts[1]
  if ([string]::IsNullOrWhiteSpace($key)) { return }

  [Environment]::SetEnvironmentVariable($key, $value, 'Process')
}

if ([string]::IsNullOrWhiteSpace($env:RELEASE_TARGET_SHA)) {
  $env:RELEASE_TARGET_SHA = (git rev-parse HEAD).Trim()
}

Write-Host "Loaded QA env vars from $EnvFile"
