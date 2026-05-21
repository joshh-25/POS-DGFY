# Multi-location contract smoke verifier (prod/qa profile)
# Read-only checks:
# 1) item detail includes item_location_stocks
# 2) stock movement export CSV includes location/source/destination columns
# 3) expiry report export CSV includes Location column

param(
  [ValidateSet('prod', 'qa')]
  [string]$Profile = 'prod'
)

$ErrorActionPreference = 'Stop'

$prefix = $Profile.ToUpperInvariant()
$baseUrlVar = "${prefix}_BASE_URL"
$tokenVar = "${prefix}_COMPANY_TOKEN"
$emailVar = "${prefix}_EMAIL"
$passwordVar = "${prefix}_PASSWORD"
$jwtVar = "${prefix}_AUTH_JWT"
$outputVar = "${prefix}_VERIFY_OUTPUT"

$baseUrl = [Environment]::GetEnvironmentVariable($baseUrlVar)
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  if ($Profile -eq 'prod') {
    $baseUrl = 'https://skupervisor.surebizcorp.com'
  } else {
    throw "Missing required environment variable: $baseUrlVar"
  }
}

$baseUrl = $baseUrl.TrimEnd('/')
$apiBase = if ($baseUrl -match '/api/v1$') { $baseUrl } else { "$baseUrl/api/v1" }

$companyToken = [Environment]::GetEnvironmentVariable($tokenVar)
$companyTokenProvided = -not [string]::IsNullOrWhiteSpace($companyToken)
$companyTokenSource = if ($companyTokenProvided) { 'env' } else { 'default_token_original' }
$isPlaceholderToken = $companyToken -eq 'token-original'

function Resolve-CompanyTokenFromSsh([string]$profileName) {
  $profilePrefix = $profileName.ToUpperInvariant()
  $sshHost = [Environment]::GetEnvironmentVariable("${profilePrefix}_SSH_HOST")
  if ([string]::IsNullOrWhiteSpace($sshHost)) { return $null }

  $sshPort = [Environment]::GetEnvironmentVariable("${profilePrefix}_SSH_PORT")
  if ([string]::IsNullOrWhiteSpace($sshPort)) { $sshPort = '22' }
  $sshUser = [Environment]::GetEnvironmentVariable("${profilePrefix}_SSH_USER")
  if ([string]::IsNullOrWhiteSpace($sshUser)) { $sshUser = 'root' }
  $appDir = [Environment]::GetEnvironmentVariable("${profilePrefix}_APP_DIR")
  if ([string]::IsNullOrWhiteSpace($appDir)) { $appDir = '/var/www/skupervisor' }

  $remoteScript = @'
set -e
APP_DIR="${1:-/var/www/skupervisor}"
cd "$APP_DIR/backend"
. ./.env
if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
  exit 9
fi
TOKEN=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" -D "$DB_NAME" -N -e "SELECT company_token FROM tenants WHERE db_name='$DB_NAME' AND status='active' ORDER BY id LIMIT 1")
if [ -z "$TOKEN" ]; then
  TOKEN=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" -D "$DB_NAME" -N -e "SELECT company_token FROM tenants WHERE status='active' ORDER BY id LIMIT 1")
fi
echo "$TOKEN"
'@

  $escapedScript = $remoteScript.Replace("`r", '').Replace("`n", '; ')
  $remoteCmd = "bash -lc ""$escapedScript '$appDir'"""
  try {
    $resolved = & ssh -p $sshPort "$sshUser@$sshHost" $remoteCmd 2>$null
    $token = ($resolved | Select-Object -First 1).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) { return $null }
    return $token
  } catch {
    return $null
  }
}

if ($Profile -eq 'qa') {
  $resolvedToken = Resolve-CompanyTokenFromSsh -profileName $Profile
  if (-not [string]::IsNullOrWhiteSpace($resolvedToken) -and ($resolvedToken -ne $companyToken)) {
    $companyToken = $resolvedToken
    $companyTokenProvided = $true
    $companyTokenSource = 'ssh_auto_resolved'
  }
}

if ((-not $companyTokenProvided) -or $isPlaceholderToken) {
  $companyToken = 'token-original'
}

$email = [Environment]::GetEnvironmentVariable($emailVar)
if ([string]::IsNullOrWhiteSpace($email)) { $email = 'admin@test.com' }

$password = [Environment]::GetEnvironmentVariable($passwordVar)
if ([string]::IsNullOrWhiteSpace($password)) { $password = 'Admin123!' }

$cachedJwt = [Environment]::GetEnvironmentVariable($jwtVar)
$outputFile = [Environment]::GetEnvironmentVariable($outputVar)
if ([string]::IsNullOrWhiteSpace($outputFile)) {
  $outputFile = ".tmp\${Profile}-multi-location-check.result.json"
}

$outputDir = Split-Path -Parent $outputFile
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$results = New-Object System.Collections.Generic.List[Object]

function Add-Result([string]$name, [bool]$ok, [string]$detail) {
  $results.Add([PSCustomObject]@{ check = $name; ok = $ok; detail = $detail }) | Out-Null
  $status = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1} :: {2}" -f $status, $name, $detail)
}

Add-Result 'auth.company_token_source' $true ("source={0}" -f $companyTokenSource)

function Get-Json($url, $method='GET', $headers=$null, $body=$null) {
  if ($body -ne $null) {
    return Invoke-RestMethod -Uri $url -Method $method -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20)
  }
  return Invoke-RestMethod -Uri $url -Method $method -Headers $headers
}

function Get-CsvHeaderColumns([string]$content) {
  if ([string]::IsNullOrWhiteSpace($content)) { return @() }
  $lines = @($content -split "`r?`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  if ($lines.Count -eq 0) { return @() }
  $header = $lines[0].Trim([char]0xFEFF)
  return @($header -split ',') | ForEach-Object { $_.Trim('"').Trim() }
}

$authHeaders = $null
$itemId = $null
$locationId = $null

try {
  if (-not [string]::IsNullOrWhiteSpace($cachedJwt)) {
    $authHeaders = @{ 'Authorization' = "Bearer $cachedJwt"; 'x-company-token' = $companyToken }
    $probe = Get-Json "$apiBase/users/me" 'GET' $authHeaders
    if ($probe.success -eq $true) {
      Add-Result 'auth.session' $true "Using cached ${jwtVar}"
    } else {
      throw 'Cached JWT probe failed'
    }
  } else {
    $login = Get-Json "$apiBase/auth/login" 'POST' @{ 'x-company-token' = $companyToken } @{ email = $email; password = $password }
    $jwt = $login.data.token
    if (-not $jwt) { throw 'No JWT from login response' }
    $authHeaders = @{ 'Authorization' = "Bearer $jwt"; 'x-company-token' = $companyToken }
    Add-Result 'auth.session' $true ("Login success role={0}" -f $login.data.role)
  }

  $me = Get-Json "$apiBase/users/me" 'GET' $authHeaders
  Add-Result 'users.me' ($me.success -eq $true) ("email={0}" -f $me.data.email)

  $locRes = Get-Json "$apiBase/tenant-locations?status=active&limit=50" 'GET' $authHeaders
  $locations = @($locRes.data)
  $locationId = if ($locations.Count -gt 0) { $locations[0].location_id } else { $null }
  Add-Result 'tenant-locations' ($locations.Count -gt 0) ("active_locations={0}; sample_location_id={1}" -f $locations.Count, $locationId)

  $itemsRes = Get-Json "$apiBase/items?fields=dropdown&status=active&limit=50" 'GET' $authHeaders
  $items = @($itemsRes.data.items)
  $itemId = if ($items.Count -gt 0) { $items[0].item_id } else { $null }
  Add-Result 'items.dropdown' ($items.Count -gt 0) ("active_items={0}; sample_item_id={1}" -f $items.Count, $itemId)

  if ($itemId) {
    $itemDetail = Get-Json "$apiBase/items/$itemId" 'GET' $authHeaders
    $itemData = $itemDetail.data
    $hasLocStocks = ($itemData -ne $null) -and ($itemData.PSObject.Properties.Name -contains 'item_location_stocks')
    $locCount = if ($hasLocStocks -and $itemData.item_location_stocks -ne $null) { @($itemData.item_location_stocks).Count } else { 0 }
    Add-Result 'items.detail.item_location_stocks' $hasLocStocks ("count={0}" -f $locCount)

    if ($locationId) {
      $batches = Get-Json "$apiBase/items/$itemId/batches?location_id=$locationId&limit=20" 'GET' $authHeaders
      $batchRows = @($batches.data.batches)
      Add-Result 'items.batches.location_filter' ($batches.success -eq $true) ("rows={0}; location_id={1}" -f $batchRows.Count, $locationId)
    } else {
      Add-Result 'items.batches.location_filter' $false 'Skipped: no location_id'
    }
  } else {
    Add-Result 'items.detail.item_location_stocks' $false 'Skipped: no active item'
    Add-Result 'items.batches.location_filter' $false 'Skipped: no active item'
  }

  $movements = Get-Json "$apiBase/stock-movements?limit=10" 'GET' $authHeaders
  $movementRows = @($movements.data.movements)
  $movementHasLocationFields = $true
  if ($movementRows.Count -gt 0) {
    $firstMove = $movementRows[0]
    $props = @($firstMove.PSObject.Properties.Name)
    $movementHasLocationFields = ($props -contains 'location_name') -or ($props -contains 'location_id')
  }
  Add-Result 'stock-movements.list' (($movements.success -eq $true) -and $movementHasLocationFields) ("rows={0}; has_location_fields={1}" -f $movementRows.Count, $movementHasLocationFields)

  if ($locationId) {
    $expiry = Get-Json "$apiBase/reports/expiry?location_id=$locationId" 'GET' $authHeaders
    Add-Result 'reports.expiry.location_filter' ($expiry.success -eq $true) ("location_id={0}" -f $locationId)

    $aging = Get-Json "$apiBase/reports/stock-aging-enhanced?location_id=$locationId" 'GET' $authHeaders
    Add-Result 'reports.stock-aging-enhanced.location_filter' ($aging.success -eq $true) ("location_id={0}" -f $locationId)
  } else {
    Add-Result 'reports.expiry.location_filter' $false 'Skipped: no location_id'
    Add-Result 'reports.stock-aging-enhanced.location_filter' $false 'Skipped: no location_id'
  }

  $movCsvResp = Invoke-WebRequest -Uri "$apiBase/stock-movements/export?format=csv&limit=10" -Headers $authHeaders -Method GET -UseBasicParsing
  $movCols = Get-CsvHeaderColumns $movCsvResp.Content
  $locationLabel = if ($movCols -contains 'Movement Location') { 'Movement Location' } elseif ($movCols -contains 'Location') { 'Location' } else { '' }
  $requiredMovCols = @($locationLabel, 'Source Location', 'Destination Location') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $missingMovCols = @($requiredMovCols | Where-Object { $movCols -notcontains $_ })
  $movementCsvOk = ($requiredMovCols.Count -eq 3) -and ($missingMovCols.Count -eq 0)
  Add-Result 'stock-movements.export.csv.headers' $movementCsvOk ("header={0}" -f ($movCols -join ','))

  if ($locationId) {
    $repCsvResp = Invoke-WebRequest -Uri "$apiBase/reports/export?type=expiry&location_id=$locationId" -Headers $authHeaders -Method GET -UseBasicParsing
    $repCols = Get-CsvHeaderColumns $repCsvResp.Content
    $hasLocation = $repCols -contains 'Location'
    Add-Result 'reports.export.expiry.csv.headers' $hasLocation ("header={0}" -f ($repCols -join ','))
  } else {
    Add-Result 'reports.export.expiry.csv.headers' $false 'Skipped: no location_id'
  }

} catch {
  $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
  if ((-not $companyTokenProvided) -and ($msg -match 'TENANT_TOKEN_INVALID')) {
    $msg = "$msg Hint: $tokenVar is unset and default token-original was used. Set $tokenVar to the active tenant token or run npm run gate:release:prod-contracts:env."
  }
  Add-Result 'script.unhandled_error' $false $msg
} finally {
  try {
    if ($authHeaders -and [string]::IsNullOrWhiteSpace($cachedJwt)) {
      [void](Get-Json "$apiBase/auth/logout" 'POST' $authHeaders @{})
    }
  } catch {}
}

$failed = @($results | Where-Object { -not $_.ok })
$final = [PSCustomObject]@{
  profile = $Profile
  generated_at = (Get-Date).ToString('o')
  base_url = $baseUrl
  api_base = $apiBase
  checks_total = $results.Count
  checks_failed = $failed.Count
  ok = ($failed.Count -eq 0)
  checks = $results
}

Write-Host "`n=== FINAL SUMMARY ==="
Write-Host "Profile: $Profile"
Write-Host "Total checks: $($results.Count)"
Write-Host "Passed: $($results.Count - $failed.Count)"
Write-Host "Failed: $($failed.Count)"
$final | ConvertTo-Json -Depth 8 | Set-Content -Path $outputFile
Write-Host "Output: $outputFile"

if ($failed.Count -gt 0) { exit 2 }
