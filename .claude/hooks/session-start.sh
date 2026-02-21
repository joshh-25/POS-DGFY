#!/bin/bash
# .claude/hooks/session-start.sh
# SKU Inventory Manager — Session Initialization Hook
# Implements DOCUMENTATION_GUIDE.md §5.4
# Run at the start of every AI session to snapshot project state.
#
# Design rules:
#   - Each section is independently non-blocking (|| true on optional checks)
#   - No set -e / set -euo pipefail —  failures warn, never abort
#   - Total runtime target: < 3 seconds

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
ENV_FILE="$BACKEND_DIR/.env"

# ─── Header ──────────────────────────────────────────────────────────────────
echo ""
echo "🚀 SKU Inventory Manager — Session Start"
echo "══════════════════════════════════════════════"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════"

# ─── §1 Dependencies ─────────────────────────────────────────────────────────
echo ""
echo "📦 §1 Dependencies"

_frontend_ok=false
_backend_ok=false
_root_ok=false

[ -d "$FRONTEND_DIR/node_modules" ] && _frontend_ok=true
[ -d "$BACKEND_DIR/node_modules" ]  && _backend_ok=true
[ -d "$PROJECT_ROOT/node_modules" ] && _root_ok=true

if $_frontend_ok; then
  echo "   ✅ Frontend  — node_modules present"
else
  echo "   ⚠️  Frontend  — missing  →  cd frontend && npm install"
fi

if $_backend_ok; then
  echo "   ✅ Backend   — node_modules present"
else
  echo "   ⚠️  Backend   — missing  →  cd backend && npm install"
fi

if $_root_ok; then
  echo "   ✅ Root      — node_modules present (concurrently, husky)"
else
  echo "   ⚠️  Root      — missing  →  npm install"
fi

# ─── §2 Environment Variables ────────────────────────────────────────────────
echo ""
echo "🔑 §2 Environment Variables"

if [ ! -f "$ENV_FILE" ]; then
  echo "   ❌ backend/.env — NOT FOUND"
  echo "      ▶  Copy backend/.env.example → backend/.env and fill in values"
else
  echo "   ✅ backend/.env — found"

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
    # Frontend
    echo "$_recent" | grep -q "^frontend/Components/"  && echo "   💼 Frontend component changes — ref: frontend/Components/"
    echo "$_recent" | grep -q "^frontend/Pages/"       && echo "   📄 Frontend page changes      — ref: frontend/Pages/"
    echo "$_recent" | grep -q "^frontend/src/services/" && echo "   🔌 API service layer changes  — ref: frontend/src/services/"

    # Backend
    echo "$_recent" | grep -q "^backend/src/routes/"      && echo "   🛣️  Backend route changes      — ref: backend/src/routes/"
    echo "$_recent" | grep -q "^backend/src/controllers/" && echo "   🎮 Backend controller changes — ref: backend/src/controllers/"
    echo "$_recent" | grep -q "^backend/src/models/"      && echo "   🗂️  Backend model changes      — ref: backend/src/models/"
    echo "$_recent" | grep -q "^backend/src/services/"    && echo "   ⚙️  Backend service changes    — ref: backend/src/services/"
    echo "$_recent" | grep -q "^backend/migrations/"      && echo "   🗃️  DB migrations changed      — run: cd backend && npx sequelize-cli db:migrate"
    echo "$_recent" | grep -q "^backend/tests/"           && echo "   🧪 Test changes               — run: cd backend && npm test"

    # Cross-cutting concerns
    echo "$_recent" | grep -qE "^backend/src/models/|^frontend/Entities/" && \
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
echo "    npm run dev:backend      # Backend only  (port 5000)"
echo "    npm run dev:frontend     # Frontend only (port 5173)"
echo ""
echo "  Production (PM2):"
echo "    pm2 start ecosystem.config.cjs   # Start all services"
echo "    pm2 restart all                  # Restart services"
echo "    pm2 logs                         # Stream logs"
echo "    ./scripts/deploy.sh              # Full production deploy"
echo ""
echo "  Database:"
echo "    cd backend && npx sequelize-cli db:migrate         # Run migrations"
echo "    node backend/scripts/sync-tenant-schemas.js        # Sync tenants"
echo ""
echo "  Testing:"
echo "    cd backend && npm test                             # All backend tests"
echo ""
echo "  Workflows:"
echo "    /health          # PM2 + API health check"
echo "    /audit           # Lint + endpoint verification"
echo "    /start-dev       # PM2 dev start"
echo "    /deploy          # Production deployment"
echo ""
echo "══════════════════════════════════════════════"
echo "📖 Reference: CLAUDE.md · TROUBLESHOOTING.md · docs/"
echo ""
