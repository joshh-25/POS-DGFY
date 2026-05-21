# Fetch latest QA deploy summary file to local evidence directory.

$ErrorActionPreference = 'Stop'

$targetSha = $env:RELEASE_TARGET_SHA
if ([string]::IsNullOrWhiteSpace($targetSha)) {
  $targetSha = (git rev-parse HEAD).Trim()
}

$qaSshHost = $env:QA_SSH_HOST
if ([string]::IsNullOrWhiteSpace($qaSshHost)) {
  throw 'Missing QA_SSH_HOST'
}
$qaSshPort = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_PORT)) { '22' } else { $env:QA_SSH_PORT }
$qaSshUser = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_USER)) { 'root' } else { $env:QA_SSH_USER }
$qaSummaryRemote = if ([string]::IsNullOrWhiteSpace($env:QA_DEPLOY_SUMMARY_REMOTE)) { '$(ls -1t /var/www/skupervisor/logs/deploy/deploy_*.summary.txt | head -1)' } else { $env:QA_DEPLOY_SUMMARY_REMOTE }
$outputFile = $env:QA_DEPLOY_SUMMARY_FILE
if ([string]::IsNullOrWhiteSpace($outputFile)) {
  $outputFile = ".tmp\release-gates\$targetSha\qa_deploy_summary.txt"
}

$outputDir = Split-Path -Parent $outputFile
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$remoteCmd = "set -e; cat $qaSummaryRemote"
$summary = & ssh -p $qaSshPort "$qaSshUser@$qaSshHost" $remoteCmd
$summary | Set-Content -Path $outputFile

Write-Host "Fetched QA deploy summary: $outputFile"
