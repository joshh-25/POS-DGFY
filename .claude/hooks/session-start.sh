#!/bin/bash
# .claude/hooks/session-start.sh
# DGFY Platform — Session Initialization Hook
# NOTE (#365): this script is not currently registered in .claude/settings.json's SessionStart
# hooks (only record-ai-attribution.js and inject-ai-attribution-context.js are) — it does not
# run automatically today. Kept and fixed as a manual dev-diagnostics script; run it by hand with
# `bash .claude/hooks/session-start.sh` if you want the snapshot below.
# Run at the start of an AI session to snapshot project state.
#
# Design rules:
#   - Each section is independently non-blocking (|| true on optional checks)
#   - No set -e / set -euo pipefail —  failures warn, never abort
#   - Total runtime target: < 3 seconds

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/apps/dgfy-api"
# Three independently-deployable frontend apps since issue #322's split
# (previously one apps/dgfy-web package); IMS_DIR is the primary dev target.
IMS_DIR="$PROJECT_ROOT/apps/dgfy-ims"
POS_DIR="$PROJECT_ROOT/apps/dgfy-pos"
STOREFRONT_DIR="$PROJECT_ROOT/apps/dgfy-storefront"
ENV_FILE="$BACKEND_DIR/.env"

# ─── Header ──────────────────────────────────────────────────────────────────
echo ""
echo "🚀 DGFY Platform — Session Start"
echo "══════════════════════════════════════════════"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════"

# ─── §1 Dependencies ─────────────────────────────────────────────────────────
echo ""
echo "📦 §1 Dependencies"

_ims_ok=false
_pos_ok=false
_storefront_ok=false
_backend_ok=false
_root_ok=false

[ -d "$IMS_DIR/node_modules" ]        && _ims_ok=true
[ -d "$POS_DIR/node_modules" ]        && _pos_ok=true
[ -d "$STOREFRONT_DIR/node_modules" ] && _storefront_ok=true
[ -d "$BACKEND_DIR/node_modules" ]    && _backend_ok=true
[ -d "$PROJECT_ROOT/node_modules" ]   && _root_ok=true

if $_ims_ok; then
  echo "   ✅ Frontend (IMS)         — node_modules present"
else
  echo "   ⚠️  Frontend (IMS)         — missing  →  cd apps/dgfy-ims && npm install"
fi

if $_pos_ok; then
  echo "   ✅ Frontend (POS)         — node_modules present"
else
  echo "   ⚠️  Frontend (POS)         — missing  →  cd apps/dgfy-pos && npm install"
fi

if $_storefront_ok; then
  echo "   ✅ Frontend (Storefront)  — node_modules present"
else
  echo "   ⚠️  Frontend (Storefront)  — missing  →  cd apps/dgfy-storefront && npm install"
fi

if $_backend_ok; then
  echo "   ✅ Backend   — node_modules present"
else
  echo "   ⚠️  Backend   — missing  →  cd apps/dgfy-api && npm install"
fi

if $_root_ok; then
  echo "   ✅ Root      — node_modules present (concurrently, husky)"
else
  echo "   ⚠️  Root      — missing  →  npm install"
fi

# Retired-path hint (issue #914): a merge/rebase from a pre-split branch can
# silently resurrect a file under one of these dead trees (git's
# directory-rename detection misses brand-new subdirectories). Report-only —
# the hard stop is .husky/pre-commit and the CI repository-quality job; this
# is just an early heads-up at session start.
_retired_hits="$(cd "$PROJECT_ROOT" && git ls-files -- 'apps/dgfy-web/**' 'frontend/**' 'backend/**' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$_retired_hits" != "0" ] && [ -n "$_retired_hits" ]; then
  echo "   ⚠️  Retired paths — $_retired_hits tracked file(s) under apps/dgfy-web/, frontend/, or backend/"
  echo "      ▶  node scripts/report-frontend-split-sync.js --post-merge --fix"
fi

# ─── §2 Environment Variables ────────────────────────────────────────────────
echo ""
echo "🔑 §2 Environment Variables"

if [ ! -f "$ENV_FILE" ]; then
  echo "   ❌ apps/dgfy-api/.env — NOT FOUND"
  echo "      ▶  Copy apps/dgfy-api/.env.example → apps/dgfy-api/.env and fill in values"
else
  echo "   ✅ apps/dgfy-api/.env — found"

  # Helper: check a key in the .env file (non-empty value)
  _env_ok() {
    local key="$1"
    grep -qE "^${key}=.+" "$ENV_FILE" 2>/dev/null
  }

  # Required in ALL environments (server.js requiredEnv)
  echo ""
  echo "   Required vars:"
  for var in DB_HOST DB_USER DB_NAME JWT_SECRET; do
    if _env_ok "$var"; then
      echo "     ✅ $var"
    else
      echo "     ❌ $var — MISSING or empty (server will reject)"
    fi
  done

  # Optional but important
  echo ""
  echo "   Optional vars:"
  if _env_ok "REDIS_URL"; then
    echo "     ✅ REDIS_URL         — Redis caching enabled"
  else
    echo "     ℹ️  REDIS_URL         — not set (Redis disabled; OK for local dev)"
  fi

  if _env_ok "OPENAI_API_KEY"; then
    echo "     ✅ OPENAI_API_KEY    — AI Assistant (SKUpervisor) enabled"
  else
    echo "     ⚠️  OPENAI_API_KEY    — not set (AI Assistant unavailable)"
  fi

  # PayPal — required in production, optional in dev
  _paypal_ok=true
  for var in PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYPAL_WEBHOOK_ID; do
    _env_ok "$var" || _paypal_ok=false
  done

  if $_paypal_ok; then
    echo "     ✅ PayPal vars       — all set (billing enabled)"
  else
    # Detect current NODE_ENV in the .env file
    _node_env=$(grep -E "^NODE_ENV=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
    if [ "$_node_env" = "production" ]; then
      echo "     ❌ PayPal vars       — MISSING in production (server will refuse to start!)"
    else
      echo "     ⚠️  PayPal vars       — not set (OK in dev; required before deploying to prod)"
    fi
  fi

  if _env_ok "SMTP_USER"; then
    echo "     ✅ SMTP_USER         — Email notifications enabled"
  else
    echo "     ℹ️  SMTP_USER         — not set (email notifications disabled)"
  fi
fi

# ─── §3 Git Context ───────────────────────────────────────────────────────────
echo ""
echo "📍 §3 Git Context"

if command -v git &>/dev/null; then
  _branch=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "N/A")
  _last=$(git -C "$PROJECT_ROOT" log -1 --oneline 2>/dev/null || echo "N/A")
  _dirty=$(git -C "$PROJECT_ROOT" status --short 2>/dev/null | wc -l | tr -d ' ')

  echo "   Branch      : $_branch"
  echo "   Last commit : $_last"
  if [ "$_dirty" -gt 0 ]; then
    echo "   Uncommitted : $_dirty file(s) with changes"
  else
    echo "   Working dir : clean"
  fi
else
  echo "   ⚠️  git not found in PATH"
fi

# ─── §4 Runtime (PM2) ────────────────────────────────────────────────────────
echo ""
echo "⚙️  §4 Runtime (PM2)"

if command -v pm2 &>/dev/null; then
  # Capture status for each named process
  _pm2_status() {
    local name="$1"
    pm2 jlist 2>/dev/null \
      | grep -o "\"name\":\"${name}\"[^}]*\"status\":\"[^\"]*\"" \
      | grep -o '"status":"[^"]*"' \
      | cut -d'"' -f4 \
      || echo "unknown"
  }

  _be_status=$(_pm2_status "sku-backend")
  _fe_status=$(_pm2_status "sku-frontend")

  _pm2_icon() {
    case "$1" in
      online)  echo "✅" ;;
      stopped) echo "🔴" ;;
      errored) echo "❌" ;;
      *)       echo "❓" ;;
    esac
  }

  echo "   $(_pm2_icon "$_be_status") sku-backend  — $_be_status"
  echo "   $(_pm2_icon "$_fe_status") sku-frontend — $_fe_status"

  if [ "$_be_status" != "online" ] || [ "$_fe_status" != "online" ]; then
    echo "   ▶  To start: pm2 start ecosystem.config.cjs"
    echo "      or:       npm run dev"
  fi
else
  echo "   ℹ️  PM2 not found — using direct npm scripts (local dev mode)"
  echo "      Start: npm run dev"
fi

# ─── §5 API Health Check ─────────────────────────────────────────────────────
echo ""
echo "🌐 §5 API Health Check"

# Try dev port 5000 first, then prod port 5001
_api_port=""
for port in 5000 5001; do
  if curl -s --max-time 2 "http://localhost:${port}/health" &>/dev/null; then
    _api_port="$port"
    break
  fi
done

if [ -n "$_api_port" ]; then
  _health_json=$(curl -s --max-time 2 "http://localhost:${_api_port}/health" 2>/dev/null)

  # Extract values safely without jq dependency
  _db_status=$(echo "$_health_json" | grep -o '"database":{[^}]*}' | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  _redis_status=$(echo "$_health_json" | grep -o '"redis":{[^}]*}' | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  _pool_util=$(echo "$_health_json" | grep -o '"utilization":"[^"]*"' | cut -d'"' -f4)

  echo "   ✅ Backend reachable on port $_api_port"

  case "$_db_status" in
    connected) echo "   ✅ Database   — connected" ;;
    *)         echo "   ❌ Database   — ${_db_status:-unknown} (check MySQL/XAMPP)" ;;
  esac

  case "$_redis_status" in
    connected)    echo "   ✅ Redis      — connected" ;;
    disconnected) echo "   ℹ️  Redis      — not connected (optional)" ;;
    *)            echo "   ❓ Redis      — ${_redis_status:-unknown}" ;;
  esac

  if [ -n "$_pool_util" ]; then
    echo "   📊 Tenant pool utilization: $_pool_util"
  fi
else
  echo "   🔴 Backend not reachable on ports 5000/5001"
  echo "      ▶  Start server: npm run dev:backend"
fi

# ─── §6 Recent Work Detection ────────────────────────────────────────────────
echo ""
echo "🔍 §6 Recent Activity (last commit diff)"

if command -v git &>/dev/null; then
  _recent=$(git -C "$PROJECT_ROOT" diff --name-only HEAD~1 2>/dev/null || echo "")

  if [ -z "$_recent" ]; then
    echo "   (No previous commit to diff, or single-commit repo)"
  else
    # Frontend (shared trunk lives in packages/web-core since issue #322's split)
    echo "$_recent" | grep -q "^packages/web-core/Components/"  && echo "   💼 Frontend component changes — ref: packages/web-core/Components/"
    echo "$_recent" | grep -q "^packages/web-core/Pages/"       && echo "   📄 Frontend page changes      — ref: packages/web-core/Pages/"
    echo "$_recent" | grep -q "^packages/web-core/src/services/" && echo "   🔌 API service layer changes  — ref: packages/web-core/src/services/"

    # Backend
    echo "$_recent" | grep -q "^apps/dgfy-api/src/routes/"      && echo "   🛣️  Backend route changes      — ref: apps/dgfy-api/src/routes/"
    echo "$_recent" | grep -q "^apps/dgfy-api/src/controllers/" && echo "   🎮 Backend controller changes — ref: apps/dgfy-api/src/controllers/"
    echo "$_recent" | grep -q "^apps/dgfy-api/src/models/"      && echo "   🗂️  Backend model changes      — ref: apps/dgfy-api/src/models/"
    echo "$_recent" | grep -q "^apps/dgfy-api/src/services/"    && echo "   ⚙️  Backend service changes    — ref: apps/dgfy-api/src/services/"
    echo "$_recent" | grep -q "^apps/dgfy-migration-runner/migrations/"      && echo "   🗃️  DB migrations changed      — run: cd apps/dgfy-migration-runner && npx sequelize-cli db:migrate"
    echo "$_recent" | grep -q "^apps/dgfy-api/tests/"           && echo "   🧪 Test changes               — run: cd apps/dgfy-api && npm test"

    # Cross-cutting concerns
    echo "$_recent" | grep -qE "^apps/dgfy-api/src/models/|^packages/web-core/Entities/" && \
      echo "   ⚠️  Entity/model changes — ensure frontend & backend schemas are in sync"

    # Docs / Audit
    echo "$_recent" | grep -q "^System_Audit/"          && echo "   📋 System Audit changes       — ref: System_Audit/"
    echo "$_recent" | grep -q "^docs/"                  && echo "   📚 Documentation changes      — ref: docs/"
    echo "$_recent" | grep -q "^\.agent/workflows/"     && echo "   🤖 Workflow definitions changed — ref: .agent/workflows/"
    echo "$_recent" | grep -q "^scripts/deploy"         && echo "   🚀 Deploy script changed       — review before next deployment"
  fi
fi

# ─── §7 Quick Commands ───────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
echo "⚡ Quick Commands"
echo ""
echo "  Development:"
echo "    npm run dev              # Start frontend + backend (concurrently)"
echo "    npm run dev:backend      # dgfy-api only  (port 5100)"
echo "    npm run dev:skupervisor  # dgfy-ims (IMS) only     (port 5173)"
echo "    npm run dev:pos          # dgfy-pos only           (port 5174)"
echo "    npm run dev:store        # dgfy-storefront only    (port 5175)"
echo ""
echo "  Production (PM2):"
echo "    pm2 start ecosystem.config.cjs   # Start all services"
echo "    pm2 restart all                  # Restart services"
echo "    pm2 logs                         # Stream logs"
echo "    ./scripts/deploy.sh              # Full production deploy"
echo ""
echo "  Database:"
echo "    cd apps/dgfy-migration-runner && npx sequelize-cli db:migrate         # Run migrations"
echo "    node apps/dgfy-api/scripts/sync-tenant-schemas.js        # Sync tenants"
echo ""
echo "  Testing:"
echo "    cd apps/dgfy-api && npm test                             # All backend tests"
echo ""
echo "  Workflows:"
echo "    /health          # PM2 + API health check"
echo "    /audit           # Lint + endpoint verification"
echo "    /start-dev       # PM2 dev start"
echo "    /deploy          # Production deployment"
echo ""
echo "══════════════════════════════════════════════"
echo "📖 Reference: AGENTS.md · CLAUDE.md · TROUBLESHOOTING.md · docs/"
echo ""
