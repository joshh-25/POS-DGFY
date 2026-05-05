param(
  [string]$ConfigPath = ".cicd/production.deploy.config.json",
  [switch]$ConfigureOnly,
  [switch]$DispatchOnly,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Set-GitHubSecret($Repo, $Name, $Value) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match "replace_with|example\.com|your_") {
    throw "Secret $Name is missing or still uses a placeholder value."
  }
  if ($DryRun) {
    Write-Host "DRY_RUN secret $Name would be configured."
    return
  }
  $Value | gh secret set $Name --repo $Repo --body-file -
}

function Set-GitHubVariable($Repo, $Name, $Value) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match "known-test-tenant|<|>") {
    throw "Variable $Name is missing or still uses a placeholder value."
  }
  if ($DryRun) {
    Write-Host "DRY_RUN variable $Name=$Value"
    return
  }
  gh variable set $Name --repo $Repo --body "$Value"
}

Require-Command gh

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config not found: $ConfigPath. Copy .cicd/production.deploy.config.example.json to .cicd/production.deploy.config.json and fill real production values."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$owner = [string]$config.repository.owner
$name = [string]$config.repository.name
$repo = "$owner/$name"
$workflow = [string]$config.workflow
if ([string]::IsNullOrWhiteSpace($repo) -or $repo -match "your-github-owner") {
  throw "repository.owner/name must be set in $ConfigPath"
}

if (-not $DispatchOnly) {
  foreach ($property in $config.secrets.PSObject.Properties) {
    Set-GitHubSecret -Repo $repo -Name $property.Name -Value ([string]$property.Value)
  }
  foreach ($property in $config.variables.PSObject.Properties) {
    Set-GitHubVariable -Repo $repo -Name $property.Name -Value ([string]$property.Value)
  }
}

if ($ConfigureOnly) {
  Write-Host "Configuration step complete for $repo."
  return
}

$dispatch = $config.dispatch
$sha = [string]$dispatch.sha
if ([string]::IsNullOrWhiteSpace($sha)) {
  $branch = [string]$config.repository.branch
  $sha = (gh api "repos/$repo/commits/$branch" --jq ".sha")
}

$inputs = @(
  "-f", "sha=$sha",
  "-f", "deploy_backend=$($dispatch.deploy_backend)",
  "-f", "deploy_ims=$($dispatch.deploy_ims)",
  "-f", "deploy_pos=$($dispatch.deploy_pos)",
  "-f", "deploy_storefront=$($dispatch.deploy_storefront)",
  "-f", "confirm_production=$($dispatch.confirm_production)"
)

if ($DryRun) {
  Write-Host "DRY_RUN workflow $workflow would be dispatched for $repo at $sha"
  Write-Host ($inputs -join " ")
  return
}

gh workflow run $workflow --repo $repo @inputs
Write-Host "Dispatched $workflow for $repo at $sha."
