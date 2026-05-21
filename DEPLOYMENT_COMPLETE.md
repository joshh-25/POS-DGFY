---
status: reference
owner: engineering
date: 2026-05-12
applies_to: production_deployment
topic: services_mode_production_release
---

# Services Mode Production Deployment Summary

## Completed Tasks

### 1. ✅ Documentation Updates
- Updated API specification with 3 new service endpoints (availability, holds, batch booking)
- Updated ADR 0016 with production readiness hardening addendums
- Updated ADR 0017 with storefront checkout multiplicity contract
- Refreshed STOREFRONT_SERVICE_MODE_CURRENT_STATE with current UI implementation
- Created compliance impact declaration for service booking holds and batch checkout

### 2. ✅ Code Cleanup
- Removed temporary directories (.tmp in root and backend)
- Verified architecture guardrails pass (31 modules, 274 code files)
- Verified controller boundary checks pass (63 controller files)
- Verified documentation lint passes (15 governed docs)
- Verified compliance contract checks pass

### 3. ✅ Commit Slices (5 commits)
**Slice 1: Database migrations & models**
- commit: 581418a - Added service booking quantity and holds data model
- Files: 2 new migrations, ServiceBookingHold model, ServiceBooking and index updates

**Slice 2: Backend service module**
- commit: c63aa8e - Implemented service booking holds and batch checkout
- Files: Service use cases, repositories, controllers, module documentation

**Slice 3: API routes and validators**
- commit: 2d3cfd5 - Added service availability, holds, and batch booking routes
- Files: store.js routes, serviceValidator.js validators, posRepository.js stock bypass

**Slice 4: Frontend storefront UI**
- commit: 14a239f - Enhanced storefront UI for services mode and checkout multiplicity
- Files: StorefrontApp.jsx, components, pages, Vite config
- Includes: Compliance impact declaration file

**Slice 5: Documentation & specifications**
- commit: cfb12bc - Updated API spec and ADRs for service booking holds and batch checkout
- Files: API specification, ADRs, feature documentation

**Slice 6: Tests and contracts**
- commit: e79f4b9 - Added service booking holds, batch, and multiplicity contract tests
- Files: Backend tests, frontend contract tests, storefront discovery, tenant provisioning

### 4. ✅ Git Status
- Commits: HEAD at e79f4b9 (5 commits ahead of origin/master)
- Working tree: Clean (no uncommitted changes)
- Remote: All commits pushed to origin/master

## Production Deployment Instructions

### Prerequisites
Before deploying to production, verify:

1. **SSH Access**: Ensure key-based SSH access to production server
   ```bash
   ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
   ```

2. **Backend Environment Variables**: Verify `.env` contains:
   - HOSTING_PROFILE (shared or vps)
   - DB_HOST, DB_USER, DB_NAME
   - JWT_SECRET, REFRESH_TOKEN_SECRET
   - CORS_ORIGIN (includes all tenant domains)
   - AUTH_BLACKLIST_FAILURE_MODE
   - TEMP_FILE_STORAGE
   - TENANT_REGISTRATION_APPROVAL_MODE=manual
   - Payment provider config (if PAYMENTS_ENABLED=true)

3. **Database Backup**: Ensure recent backup exists
   - Migrations will run against live database
   - Service booking schema additions are additive only

4. **Deployment Lock**: Check `/tmp/skupervisor_deploy.lock` is free

### Standard Deployment

**Option 1: Unattended Deployment (Recommended)**
```bash
cd /var/www/skupervisor
npm run deploy:auto
```

**Option 2: With Verification**
```bash
cd /var/www/skupervisor
npm run deploy:verify
```

**Option 3: Manual Deployment**
```bash
cd /var/www/skupervisor
bash scripts/deploy.sh --auto
```

### Post-Deployment Verification

1. **Check Backend Health**
   ```bash
   curl -s https://skupervisor.dgfy.ph/api/v1/health | jq .
   ```

2. **Verify Service Endpoints**
   ```bash
   # Check new availability endpoint exists
   curl -s "https://skupervisor.dgfy.ph/api/v1/store/services/availability?service_item_id=1&date=2026-05-12&quantity=1" | jq .

   # Check new holds endpoint exists
   curl -X POST https://skupervisor.dgfy.ph/api/v1/store/services/holds \
     -H "Content-Type: application/json" \
     -d '{"service_item_id":1}' | jq .
   ```

3. **Verify Frontend Assets**
   - Check storefront loads without errors
   - Verify service booking UI renders with quantity inputs
   - Test hold creation flow
   - Test batch checkout with multiple drafts

4. **Verify Database Migrations**
   ```bash
   # On production server
   cd backend
   npm run migrate --status  # Should show all migrations as up
   ```

5. **Check Logs**
   ```bash
   tail -f /var/www/skupervisor/logs/combined.log
   tail -f /var/www/skupervisor/logs/deploy/latest.log
   ```

## Rollback Procedure

If deployment fails or issues arise:

1. **Identify Last Good Commit**
   ```bash
   git log --oneline -20
   # Find commit before service booking changes (a105fc6)
   ```

2. **Rollback Git**
   ```bash
   cd /var/www/skupervisor
   git reset --hard a105fc6  # Last good commit
   ```

3. **Rollback Database** (if migrations ran)
   ```bash
   cd backend
   npm run migrate:undo  # Undo service booking migrations
   ```

4. **Restart Services**
   ```bash
   npm run deploy  # Redeploy previous stable version
   ```

## Key Contract Points for Operations

### Service Booking Holds
- Auto-expire after configured TTL (prevents indefinite locks)
- Can be replaced by editing draft without re-fetching availability
- Must be consumed by final booking mutation (hold_token)
- Reserved capacity counts toward availability calculations

### Batch Bookings
- All-or-nothing atomicity: fail one draft = fail entire batch
- Per-booking payment URLs must all be rendered to customer
- Multiple service types/schedules allowed in same batch
- Idempotency enabled: retries replay existing response

### Quantity Support
- Quantity > 1 requires active assigned service resource
- Provider-only and location-only bookings remain capacity 1
- Capacity checks multiply by quantity
- Storefront validation happens at availability and booking time

### Stock Bypass
- Service items (category=service) never trigger FIFO/location deduction
- Physical items in Services Mode tenant carts still obey stock rules
- POS visibility is independent from Storefront visibility

## Compliance & Audit Trail

- Compliance impact declaration: `docs/compliance/impact-declarations/2026-05-12-service-booking-holds-batch-checkout.md`
- Architecture review: All changes pass guardrails and controller boundary checks
- Documentation review: All governed docs validated and metadata updated
- Test coverage: Comprehensive unit and contract tests included
- No architecture exceptions introduced
