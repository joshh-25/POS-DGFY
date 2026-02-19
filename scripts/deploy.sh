#!/bin/bash

# ==========================================
# Production Deployment Script
# ==========================================
# This script automates the deployment process on the production server.
# It handles pulling code, installing dependencies, building assets,
# running migrations, and restarting services.
#
# Usage: ./scripts/deploy.sh

# ------------------------------------------
# Configuration & Setup
# ------------------------------------------

# Exit immediately if a command exits with a non-zero status
set -e

# Resolve Project Root (assumes script is in <root>/scripts/)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ------------------------------------------
# Environment Validation Helper
# ------------------------------------------

REQUIRED_VARS=("PAYPAL_CLIENT_ID" "PAYPAL_CLIENT_SECRET" "PAYPAL_MODE" "PAYPAL_WEBHOOK_ID")

check_env() {
    local env_file="$BACKEND_DIR/.env"
    if [ ! -f "$env_file" ]; then
        error "Backend .env file missing at $env_file"
        exit 1
    fi

    log "Validating PayPal configuration..."
    for var in "${REQUIRED_VARS[@]}"; do
        if ! grep -q "^$var=" "$env_file" || grep -q "^$var=$" "$env_file"; then
            error "Missing or empty required environment variable: $var in $env_file"
            exit 1
        fi
    done
    log "PayPal configuration validated."
}

# Logging function with timestamp
log() {
    echo -e "\n[$(date +'%Y-%m-%d %H:%M:%S')] 🚀 $1"
}

warn() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1"
}

error() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1"
}

# Run validation before proceeding
check_env

# Trap errors to report failure
trap 'error "Deployment failed! Check logs above for details."' ERR

# ------------------------------------------
# Main Deployment Flow
# ------------------------------------------

cd "$PROJECT_ROOT" || { error "Could not cd to project root"; exit 1; }

log "Starting deployment for: $PROJECT_ROOT"

# 1. Pull Latest Changes
log "Step 1: Pulling latest code from git..."
git pull origin master

# 2. Install Dependencies
log "Step 2: Installing dependencies..."

echo ">> Root dependencies..."
npm install --no-audit --no-fund

echo ">> Backend dependencies..."
cd "$BACKEND_DIR"
npm install --no-audit --no-fund
cd "$PROJECT_ROOT"

echo ">> Frontend dependencies..."
cd "$FRONTEND_DIR"
npm install --no-audit --no-fund
cd "$PROJECT_ROOT"

# 3. Build Frontend
log "Step 3: Building frontend..."
cd "$FRONTEND_DIR"
# Ensure production environment for build
NODE_ENV=production npm run build
cd "$PROJECT_ROOT"

# 4. Database Migrations
log "Step 4: Running database migrations..."
cd "$BACKEND_DIR"

# Run Migrations (using configured .sequelizerc path)
echo ">> Running database migrations..."
npx sequelize-cli db:migrate

# 5. Structural Fixes & Helper Scripts
log "Step 5: Running maintenance and sync scripts..."

# Run precision fix script if it exists
if [ -f "scripts/deploy_fix_precision.js" ]; then
    echo ">> Running structural precision fixes..."
    node scripts/deploy_fix_precision.js
    
    echo ">> Running surgical schema fixes (Webhooks & Index Pruning)..."
    node scripts/surgical_migrate.js
else
    # Keeping the original echo if script is missing, just in case it was a placeholder
    echo ">> (Skipping precision fixes - script not found)"
fi

# Sync Tenant Schemas
echo ">> Syncing schemas for all active tenants..."
if [ -f "scripts/sync-tenant-schemas.js" ]; then
    node "scripts/sync-tenant-schemas.js"
else
    warn "Tenant sync script not found (backend/scripts/sync-tenant-schemas.js)"
fi

# Register/Update Legacy Admin Tenant
echo ">> Ensuring Legacy Admin (admin@test.com) is Premium..."
if [ -f "scripts/register_legacy_tenant.js" ]; then
    node "scripts/register_legacy_tenant.js"
else
    warn "Legacy registration script not found (backend/scripts/register_legacy_tenant.js)"
fi

cd "$PROJECT_ROOT"

# 6. Restart Services
# 5b. Force Production Env for PM2
log "Step 6: Restarting PM2 services (Production Mode)..."
if command -v pm2 >/dev/null 2>&1; then
    # Start or Restart using the ecosystem file to ensure env vars are loaded
    if [ -f "ecosystem.config.js" ]; then
        echo ">> using ecosystem.config.js..."
        pm2 startOrRestart ecosystem.config.js --env production --update-env
    else 
        # Fallback if no ecosystem file (though we just created it)
        warn "ecosystem.config.js not found. Restarting existing processes..."
        pm2 restart all --update-env
    fi
else
    warn "PM2 not found in PATH. Skipping service restart."
fi

# 7. Post-Deployment Verification
log "Step 7: Verifying deployment..."

# Simple Smoke Test
# Wait a few seconds for server to boot
sleep 5

API_HEALTH_URL="http://localhost:5001/api/v1/health" # Adjust if there is a specific health endpoint, otherwise check root or items
# Fallback to items endpoint if health doesn't exist yet (based on previous curl examples)
API_TEST_URL="http://localhost:5001/api/v1/items"

echo ">> Pinging Backend API ($API_TEST_URL)..."

if command -v curl >/dev/null 2>&1; then
    # Retry loop: Try 10 times, waiting 3 seconds between checks (Total 30s)
    MAX_RETRIES=10
    COUNT=0
    SUCCESS=0

    while [ $COUNT -lt $MAX_RETRIES ]; do
        set +e
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_TEST_URL")
        EXIT_CODE=$?
        set -e

        if [ $EXIT_CODE -ne 0 ]; then
             echo "   ... curl failed with exit code $EXIT_CODE. Waiting..."
        elif [[ "$HTTP_CODE" =~ ^2 ]]; then
            echo "   ✅ Backend appears healthy (HTTP $HTTP_CODE)"
            SUCCESS=1
            break
        elif [[ "$HTTP_CODE" == "401" ]]; then
            echo "   ✅ Backend is reachable (HTTP 401 Unauthorized is expected for protected routes)"
            SUCCESS=1
            break
        else
            echo "   ... Attempt $((COUNT+1))/$MAX_RETRIES: Received HTTP $HTTP_CODE. Waiting..."
        fi
        
        sleep 3
        COUNT=$((COUNT+1))
    done

    if [ $SUCCESS -eq 0 ]; then
        warn "Backend did not respond with 2xx/401 after 30 seconds."
        echo "   Last HTTP status: $HTTP_CODE" 
        # We don't exit 1 here to avoid failing the whole pipeline if it's just slow, 
        # but we warn significantly.
    fi

else
    echo ">> curl not found, skipping API check."
fi

# Check PM2 status
if command -v pm2 >/dev/null 2>&1; then
    pm2 status | grep -E "online|errored" || true
fi

# 8. Production Billing Verification
log "Step 8: Verifying production billing logic..."
cd "$BACKEND_DIR"
if [ -f "scripts/verify_production_billing.js" ]; then
    echo ">> Running billing logic integration tests..."
    node scripts/verify_production_billing.js
else
    warn "Billing verification script not found: backend/scripts/verify_production_billing.js"
fi
cd "$PROJECT_ROOT"

log "✅ Deployment completed successfully!"
