# Deploy the pushed release target to a distinct QA environment before the
# production no-staging gate. Dry-run mode validates configuration and command
# construction without SSH mutation.

$ErrorActionPreference = 'Stop'

function Import-EnvFileIfPresent {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_
    if ($line.Length -gt 0 -and $line[0] -eq [char]0xFEFF) {
      $line = $line.Substring(1)
    }
    $line = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#') -or -not $line.Contains('=')) {
      return
    }

    $key = $line.Substring(0, $line.IndexOf('=')).Trim()
    if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
      Write-Warning "Skipping invalid env key in ${Path}: ${key}"
      return
    }

    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($key, 'Process'))) {
      return
    }

    $value = $line.Substring($line.IndexOf('=') + 1).Trim()
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

function Normalize-RemotePath {
  param([string]$Path)
  return ($Path.TrimEnd('/'))
}

function Escape-SingleQuotedShellValue {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'\''") + "'"
}

$qaEnvFile = if ([string]::IsNullOrWhiteSpace($env:QA_ENV_FILE)) { '.env.qa.local' } else { $env:QA_ENV_FILE }
$qaSecretsFile = if ([string]::IsNullOrWhiteSpace($env:QA_SECRETS_FILE)) { '.env.qa.secrets.local' } else { $env:QA_SECRETS_FILE }
Import-EnvFileIfPresent -Path $qaEnvFile
Import-EnvFileIfPresent -Path $qaSecretsFile

$targetSha = $env:RELEASE_TARGET_SHA
if ([string]::IsNullOrWhiteSpace($targetSha)) {
  throw 'Missing RELEASE_TARGET_SHA'
}

$qaSshHost = $env:QA_SSH_HOST
if ([string]::IsNullOrWhiteSpace($qaSshHost)) {
  throw 'Missing QA_SSH_HOST'
}

$qaSshPort = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_PORT)) { '22' } else { $env:QA_SSH_PORT }
if ($qaSshPort -notmatch '^\d+$') {
  throw "Invalid QA_SSH_PORT=$qaSshPort"
}

$qaSshUser = if ([string]::IsNullOrWhiteSpace($env:QA_SSH_USER)) { 'root' } else { $env:QA_SSH_USER }
$qaAppDir = if ([string]::IsNullOrWhiteSpace($env:QA_APP_DIR)) { '/var/www/skupervisor' } else { $env:QA_APP_DIR }
$qaDeployBranch = if ([string]::IsNullOrWhiteSpace($env:QA_DEPLOY_BRANCH)) { 'master' } else { $env:QA_DEPLOY_BRANCH }
$prodRemoteHost = $env:DEPLOY_PROD_REMOTE_HOST
$prodRemoteDir = $env:DEPLOY_PROD_REMOTE_DIR
$dryRunValue = if ([string]::IsNullOrWhiteSpace($env:QA_DEPLOY_DRY_RUN)) { '' } else { $env:QA_DEPLOY_DRY_RUN }
$dryRun = @('1', 'true', 'yes') -contains $dryRunValue.ToLowerInvariant()

if (-not [string]::IsNullOrWhiteSpace($prodRemoteHost) -and
    -not [string]::IsNullOrWhiteSpace($prodRemoteDir) -and
    $qaSshHost.Trim().ToLowerInvariant() -eq $prodRemoteHost.Trim().ToLowerInvariant() -and
    (Normalize-RemotePath $qaAppDir) -eq (Normalize-RemotePath $prodRemoteDir)) {
  throw 'Configured QA target is production. Refusing QA promotion. Configure a distinct isolated QA target.'
}

$quotedAppDir = Escape-SingleQuotedShellValue $qaAppDir
$quotedBranch = Escape-SingleQuotedShellValue $qaDeployBranch
$quotedSha = Escape-SingleQuotedShellValue $targetSha
$quotedCommitRef = Escape-SingleQuotedShellValue "$targetSha^{commit}"
$remoteCommand = "set -e; cd $quotedAppDir; git fetch origin $quotedBranch; git cat-file -e $quotedCommitRef; bash scripts/deploy.sh --branch $quotedBranch --expect-commit $quotedSha"

Write-Host "QA promotion target: $qaSshUser@$qaSshHost`:$qaSshPort $qaAppDir"
Write-Host "QA promotion SHA: $targetSha"

if ($dryRun) {
  Write-Host 'QA promotion dry run: command construction succeeded; SSH mutation skipped.'
  Write-Host "Remote command: $remoteCommand"
  exit 0
}

& ssh -p $qaSshPort "$qaSshUser@$qaSshHost" $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "QA promotion SSH command failed with exit code $LASTEXITCODE"
}

Write-Host "QA promotion completed for $targetSha"
