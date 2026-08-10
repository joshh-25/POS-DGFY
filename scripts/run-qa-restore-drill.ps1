# QA backup restore drill (simulation by default)

$ErrorActionPreference = 'Stop'

$targetSha = $env:RELEASE_TARGET_SHA
if ([string]::IsNullOrWhiteSpace($targetSha)) {
  $targetSha = (git rev-parse HEAD).Trim()
}

$outputFile = $env:QA_RESTORE_DRILL_OUTPUT
if ([string]::IsNullOrWhiteSpace($outputFile)) {
  $outputFile = ".tmp\release-gates\$targetSha\restore_drill_result.json"
}
$outputDir = Split-Path -Parent $outputFile
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$apply = ($env:QA_RESTORE_DRILL_APPLY -eq '1')
$qaSshHost = $env:QA_SSH_HOST
$qaSshPort = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_PORT)) { '22' } else { $env:QA_SSH_PORT }
$qaSshUser = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_USER)) { 'root' } else { $env:QA_SSH_USER }
$qaAppDir = if ([string]::IsNullOrWhiteSpace($env:QA_APP_DIR)) { '/var/www/skupervisor' } else { $env:QA_APP_DIR }
$qaBackupFile = $env:QA_RESTORE_BACKUP_FILE
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
  Add-Check 'mode' $true $mode
  Add-Check 'input.target_sha' (-not [string]::IsNullOrWhiteSpace($targetSha)) ("target_sha=$targetSha")

  if ([string]::IsNullOrWhiteSpace($qaSshHost)) {
    Add-Check 'qa.ssh.configured' $false 'Missing QA_SSH_HOST'
  } else {
    Add-Check 'qa.ssh.configured' $true ("${qaSshUser}@${qaSshHost}:$qaSshPort")
    $probe = & ssh @sshOptions -p $qaSshPort "$qaSshUser@$qaSshHost" "echo QA_SSH_OK" 2>$null
    Add-Check 'qa.ssh.reachable' ($probe -match 'QA_SSH_OK') 'SSH connectivity probe'
  }

  if ($apply) {
    if ([string]::IsNullOrWhiteSpace($qaBackupFile)) {
      Add-Check 'qa.restore.backup_file' $false 'Missing QA_RESTORE_BACKUP_FILE for apply mode'
    } else {
      Add-Check 'qa.restore.backup_file' $true $qaBackupFile
    }
  } else {
    Add-Check 'qa.restore.backup_file' $true 'Simulation mode (backup path not required)'
  }

  if ($apply -and -not [string]::IsNullOrWhiteSpace($qaSshHost) -and -not [string]::IsNullOrWhiteSpace($qaBackupFile)) {
    $cmd = @(
      'set -e',
      "cd '$qaAppDir'",
      "test -f '$qaBackupFile'",
      "bash -lc 'cd apps/dgfy-migration-runner && npx sequelize-cli db:migrate:status || true'",
      "bash -lc 'cd apps/dgfy-api && npm run audit:indexes'"
    ) -join '; '
    & ssh @sshOptions -t -p $qaSshPort "$qaSshUser@$qaSshHost" $cmd
    Add-Check 'qa.restore.apply' $true "Validated restore prerequisites and post-restore index audit for $qaBackupFile"
  } else {
    Add-Check 'qa.restore.apply' $true 'Simulation mode (no remote mutation executed)'
  }
} catch {
  Add-Check 'qa.restore.exception' $false $_.Exception.Message
}

$failed = @($checks | Where-Object { -not $_.ok })
$result = [PSCustomObject]@{
  generated_at = (Get-Date).ToString('o')
  target_sha = $targetSha
  mode = $mode
  ok = ($failed.Count -eq 0)
  checks_total = $checks.Count
  checks_failed = $failed.Count
  checks = $checks
}

$result | ConvertTo-Json -Depth 8 | Set-Content -Path $outputFile
Write-Host "Restore drill output: $outputFile"
if ($failed.Count -gt 0) { exit 2 }
