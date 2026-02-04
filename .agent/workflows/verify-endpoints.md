---
description: Run the backend endpoint verification script automatically
---
// turbo-all

# Backend Endpoint Verification

This workflow runs a comprehensive check of key backend API endpoints to verify system health.

### 1. Run Verification Script
```powershell
Write-Output "=== RESUMING PHASE 1: ENDPOINT VERIFICATION ===`n"; $start = Get-Date; try { $resp = Invoke-RestMethod -Uri 'http://localhost:5000/api/v1/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"admin@test.com","password":"Admin123!"}' -ErrorAction Stop; $token = $resp.data.token; Write-Output " AUTH: Login successful"; $endpoints = @(@{name="Users (Core)"; url="/api/v1/users/me"}, @{name="Items (Operations)"; url="/api/v1/items?limit=2"}, @{name="Suppliers (Operations)"; url="/api/v1/suppliers?limit=2"}, @{name="Purchase Orders (Operations)"; url="/api/v1/purchase-orders?limit=2"}, @{name="Job Orders (Operations)"; url="/api/v1/job-orders?limit=2"}, @{name="Stock Movements (Operations)"; url="/api/v1/stock-movements?limit=2"}, @{name="Dashboard Stats (Analytics)"; url="/api/v1/dashboard/stats"}, @{name="Alerts (Analytics)"; url="/api/v1/alerts"}); $passed = 0; $failed = 0; foreach ($ep in $endpoints) { try { $result = Invoke-RestMethod -Uri "http://localhost:5000$($ep.url)" -Headers @{Authorization="Bearer $token"} -ErrorAction Stop; Write-Output " $($ep.name): OK"; $passed++ } catch { Write-Output " $($ep.name): FAILED - $($_.Exception.Message)"; $failed++ } }; $elapsed = ((Get-Date) - $start).TotalSeconds; Write-Output "`n=== Results ==="; Write-Output "Passed: $passed/$($endpoints.Count)"; Write-Output "Failed: $failed"; if ($failed -eq 0) { Write-Output "`n ALL ENDPOINTS VERIFIED" } else { Write-Output "`n SOME ENDPOINTS FAILED" } } catch { Write-Output " Login failed: $($_.Exception.Message)" }
```
