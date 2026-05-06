# QA rollback drill (simulation by default)

$ErrorActionPreference = 'Stop'

$targetSha = $env:RELEASE_TARGET_SHA
if ([string]::IsNullOrWhiteSpace($targetSha)) {
  $targetSha = (git rev-parse HEAD).Trim()
}

$rollbackSha = $env:QA_ROLLBACK_SHA
if ([string]::IsNullOrWhiteSpace($rollbackSha)) {
  try {
    $rollbackSha = (git rev-parse HEAD~1).Trim()
  } catch {
    $rollbackSha = ''
  }
}

$outputFile = $env:QA_ROLLBACK_DRILL_OUTPUT
if ([string]::IsNullOrWhiteSpace($outputFile)) {
  $outputFile = ".tmp\release-gates\$targetSha\rollback_drill_result.json"
}
$outputDir = Split-Path -Parent $outputFile
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$apply = ($env:QA_ROLLBACK_DRILL_APPLY -eq '1')
$qaSshHost = $env:QA_SSH_HOST
$qaSshPort = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_PORT)) { '22' } else { $env:QA_SSH_PORT }
$qaSshUser = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_USER)) { 'root' } else { $env:QA_SSH_USER }
$qaAppDir = if ([string]::IsNullOrWhiteSpace($env:QA_APP_DIR)) { '/var/www/skupervisor' } else { $env:QA_APP_DIR }
$sshOptions = @('-o', 'LogLevel=ERROR')
$sshSupportsWarnWeakCrypto = $false
try {
  & ssh -G -o WarnWeakCrypto=no localhost 2>$null | Out-Null
  $sshSupportsWarnWeakCrypto = ($LASTEXITCODE -eq 0)
} catch {
  $sshSupportsWarnWeakCrypto = $false
}
if ($sshSupportsWarnWeakCrypto) {
  $sshOptions = @('-o', 'WarnWeakCrypto=no') + $sshOptions
}

$checks = New-Object System.Collections.Generic.List[Object]
function Add-Check([string]$name, [bool]$ok, [string]$detail) {
  $checks.Add([PSCustomObject]@{ check = $name; ok = $ok; detail = $detail }) | Out-Null
}

try {
  $mode = if ($apply) { 'apply' } else { 'simulation' }
  Add-Check 'input.target_sha' (-not [string]::IsNullOrWhiteSpace($targetSha)) ("target_sha=$targetSha")
  Add-Check 'input.rollback_sha' (-not [string]::IsNullOrWhiteSpace($rollbackSha)) ("rollback_sha=$rollbackSha")
  Add-Check 'mode' $true $mode

  if ([string]::IsNullOrWhiteSpace($qaSshHost)) {
    Add-Check 'qa.ssh.configured' $false 'Missing QA_SSH_HOST'
  } else {
    Add-Check 'qa.ssh.configured' $true ("${qaSshUser}@${qaSshHost}:$qaSshPort")
    $probe = & ssh @sshOptions -p $qaSshPort "$qaSshUser@$qaSshHost" "echo QA_SSH_OK" 2>$null
    Add-Check 'qa.ssh.reachable' ($probe -match 'QA_SSH_OK') 'SSH connectivity probe'
  }

  if ($apply -and -not [string]::IsNullOrWhiteSpace($qaSshHost) -and -not [string]::IsNullOrWhiteSpace($rollbackSha)) {
    $cmd = @(
      'set -e',
      "cd '$qaAppDir'",
      'git fetch origin',
      "git rev-parse --verify '$rollbackSha'",
      "bash scripts/deploy.sh --branch master --expect-commit '$rollbackSha'"
    ) -join '; '
    & ssh @sshOptions -t -p $qaSshPort "$qaSshUser@$qaSshHost" $cmd
    Add-Check 'qa.rollback.apply' $true "Applied rollback deploy to $rollbackSha"
  } else {
    Add-Check 'qa.rollback.apply' $true 'Simulation mode (no remote mutation executed)'
  }
} catch {
  Add-Check 'qa.rollback.exception' $false $_.Exception.Message
}

$failed = @($checks | Where-Object { -not $_.ok })
$result = [PSCustomObject]@{
  generated_at = (Get-Date).ToString('o')
  target_sha = $targetSha
  rollback_sha = $rollbackSha
  mode = $mode
  ok = ($failed.Count -eq 0)
  checks_total = $checks.Count
  checks_failed = $failed.Count
  checks = $checks
}

$result | ConvertTo-Json -Depth 8 | Set-Content -Path $outputFile
Write-Host "Rollback drill output: $outputFile"
if ($failed.Count -gt 0) { exit 2 }
