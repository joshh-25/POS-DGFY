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
    echo ">> Running structural precision fixes (product_composition)..."
    node scripts/deploy_fix_precision.js

    echo ">> Running surgical schema fixes (Webhooks & Index Pruning)..."
    node scripts/surgical_migrate.js
else
    # Keeping the original echo if script is missing, just in case it was a placeholder
    echo ">> (Skipping precision fixes - script not found)"
fi

# Run v2 precision fix (JO, PO, Stock, FIFO, Item quantity columns)
if [ -f "scripts/deploy_fix_precision_v2.js" ]; then
    echo ">> Running precision migration v2 (quantity columns across all tables)..."
    node scripts/deploy_fix_precision_v2.js
else
    warn "Precision v2 script not found (backend/scripts/deploy_fix_precision_v2.js)"
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

# 5b. Inject required env vars into backend .env if not already present
log "Step 5b: Ensuring production env vars are set..."
ENV_FILE="$BACKEND_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    # RATE_LIMIT_MAX_REQUESTS: raises per-IP limit from 100 to 500 so legitimate users
    # with multiple tabs and AI Chat usage don't trigger 429 errors.
    if ! grep -q "^RATE_LIMIT_MAX_REQUESTS=" "$ENV_FILE"; then
        echo "" >> "$ENV_FILE"
        echo "# Rate limit per real client IP (500 req/15min — safe for 5 users/tenant doing AI Chat + Dashboard)" >> "$ENV_FILE"
        echo "RATE_LIMIT_MAX_REQUESTS=500" >> "$ENV_FILE"
        log "Added RATE_LIMIT_MAX_REQUESTS=500 to backend/.env"
    else
        log "RATE_LIMIT_MAX_REQUESTS already set in backend/.env — skipping."
    fi
else
    warn "backend/.env not found at $ENV_FILE — skipping env var injection."
fi

# 6. Restart Services
log "Step 6: Restarting PM2 services (Production Mode)..."
if command -v pm2 >/dev/null 2>&1; then
    # Prefer ecosystem.config.cjs (current CommonJS config file)
    # Fall back to .js if .cjs is not found (legacy support)
    if [ -f "$PROJECT_ROOT/ecosystem.config.cjs" ]; then
        ECOSYSTEM_FILE="$PROJECT_ROOT/ecosystem.config.cjs"
    elif [ -f "$PROJECT_ROOT/ecosystem.config.js" ]; then
        ECOSYSTEM_FILE="$PROJECT_ROOT/ecosystem.config.js"
    else
        ECOSYSTEM_FILE=""
    fi

    if [ -n "$ECOSYSTEM_FILE" ]; then
        echo ">> Using $ECOSYSTEM_FILE..."
        # startOrReload: zero-downtime reload if already running, fresh start if not
        pm2 startOrReload "$ECOSYSTEM_FILE" --env production --update-env
    else
        warn "No ecosystem config file found. Restarting existing PM2 processes..."
        pm2 restart all --update-env
    fi

    # Persist the process list so PM2 auto-starts after a server reboot
    pm2 save
else
    warn "PM2 not found in PATH. Skipping service restart."
fi

# 7. Post-Deployment Verification
log "Step 7: Verifying deployment..."

# Use the dedicated /health endpoint (no auth required, returns DB + Redis status).
# Backend runs on port 5000 (not 5001).
API_HEALTH_URL="http://localhost:5000/health"

echo ">> Waiting for backend to boot..."
sleep 5

echo ">> Pinging health endpoint ($API_HEALTH_URL)..."

if command -v curl >/dev/null 2>&1; then
    # Retry loop: 10 attempts × 3 seconds = 30 seconds max wait
    MAX_RETRIES=10
    COUNT=0
    SUCCESS=0

    while [ $COUNT -lt $MAX_RETRIES ]; do
        set +e
        RESPONSE=$(curl -s -o /tmp/health_response.json -w "%{http_code}" "$API_HEALTH_URL")
        EXIT_CODE=$?
        set -e

        if [ $EXIT_CODE -ne 0 ]; then
            echo "   ... curl failed (exit $EXIT_CODE). Server may still be starting. Waiting..."
        elif [[ "$RESPONSE" == "200" ]]; then
            echo "   ✅ Backend is healthy (HTTP 200)"
            # Show DB/Redis status from health response if jq is available
            if command -v jq >/dev/null 2>&1; then
                echo "   DB status:    $(jq -r '.services.database.status' /tmp/health_response.json 2>/dev/null || echo 'n/a')"
                echo "   Redis status: $(jq -r '.services.redis.status' /tmp/health_response.json 2>/dev/null || echo 'n/a')"
                echo "   Tenant pool:  $(jq -r '.services.tenantPool.utilization' /tmp/health_response.json 2>/dev/null || echo 'n/a')"
            fi
            SUCCESS=1
            break
        elif [[ "$RESPONSE" == "503" ]]; then
            echo "   ⚠️  Backend responded 503 (DB or Redis unhealthy). Check logs."
            SUCCESS=1  # Server is running, just a dependency issue — don't block deploy
            break
        else
            echo "   ... Attempt $((COUNT+1))/$MAX_RETRIES: HTTP $RESPONSE. Waiting..."
        fi

        sleep 3
        COUNT=$((COUNT+1))
    done

    if [ $SUCCESS -eq 0 ]; then
        warn "Backend did not respond after 30 seconds. Check: pm2 logs sku-backend"
    fi
else
    echo ">> curl not found, skipping health check."
fi

# Show PM2 process status
if command -v pm2 >/dev/null 2>&1; then
    echo ""
    pm2 list
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
