#!/usr/bin/env bash

# Production deployment pipeline with evidence logging and strict gates.
# Run this on the production server from the repository root:
#   bash scripts/deploy.sh [--branch <name>] [--expect-commit <sha>] [--skip-db-backup]

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DEPLOY_LOG_DIR="$PROJECT_ROOT/logs/deploy"
DEPLOY_STATE_DIR="$PROJECT_ROOT/.deploy-state"
LOCK_FILE="/tmp/skupervisor_deploy.lock"

BRANCH_OVERRIDE=""
EXPECTED_COMMIT=""
SKIP_DB_BACKUP="0"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --branch)
            BRANCH_OVERRIDE="${2:-}"
            shift 2
            ;;
        --expect-commit)
            EXPECTED_COMMIT="${2:-}"
            shift 2
            ;;
        --skip-db-backup)
            SKIP_DB_BACKUP="1"
            shift
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: bash scripts/deploy.sh [--branch <name>] [--expect-commit <sha>] [--skip-db-backup]"
            exit 1
            ;;
    esac
done

mkdir -p "$DEPLOY_LOG_DIR" "$DEPLOY_STATE_DIR"
RUN_TS="$(date +'%Y%m%d_%H%M%S')"
LOG_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.log"
MANIFEST_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.changed_files.txt"
SUMMARY_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.summary.txt"

exec > >(tee -a "$LOG_FILE") 2>&1

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $1"
}

fatal() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1"
    exit 1
}

require_command() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || fatal "Missing required command: $cmd"
}

run_optional_node_script() {
    local cwd="$1"
    local relative_script="$2"
    local label="$3"

    if [[ -f "$cwd/$relative_script" ]]; then
        log "Running optional hook: $label ($relative_script)"
        (cd "$cwd" && node "$relative_script")
    else
        warn "Optional hook not found, skipping: $relative_script"
    fi
}

trap 'fatal "Deployment failed at line $LINENO. See $LOG_FILE"' ERR

require_command git
require_command npm
require_command node
require_command npx
require_command bash

if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    flock -n 9 || fatal "Another deployment appears to be running (lock: $LOCK_FILE)"
else
    warn "flock is not available. Concurrent deploy protection is limited."
fi

cd "$PROJECT_ROOT"

log "Deployment log: $LOG_FILE"
log "Project root: $PROJECT_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
    fatal "Working tree is not clean on server. Commit/stash local server changes before deploying."
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "HEAD" ]]; then
    fatal "Repository is in detached HEAD state. Checkout a branch before deploying."
fi

TARGET_BRANCH="${BRANCH_OVERRIDE:-$CURRENT_BRANCH}"
log "Target branch: $TARGET_BRANCH"

ENV_FILE="$BACKEND_DIR/.env"
[[ -f "$ENV_FILE" ]] || fatal "Missing backend env file: $ENV_FILE"

REQUIRED_ENV_VARS=("PAYPAL_CLIENT_ID" "PAYPAL_CLIENT_SECRET" "PAYPAL_MODE" "PAYPAL_WEBHOOK_ID" "DB_HOST" "DB_USER" "DB_NAME")
for var in "${REQUIRED_ENV_VARS[@]}"; do
    if ! grep -q "^${var}=" "$ENV_FILE"; then
        fatal "Missing required env variable ${var} in backend/.env"
    fi
    if grep -q "^${var}=$" "$ENV_FILE"; then
        fatal "Empty required env variable ${var} in backend/.env"
    fi
done
log "Required env validation passed."

PRE_DEPLOY_COMMIT="$(git rev-parse HEAD)"
LAST_DEPLOYED_COMMIT="unknown"
if [[ -f "$DEPLOY_STATE_DIR/last_deployed_commit" ]]; then
    LAST_DEPLOYED_COMMIT="$(cat "$DEPLOY_STATE_DIR/last_deployed_commit")"
fi

log "Previous HEAD on server: $PRE_DEPLOY_COMMIT"
log "Last recorded deployed commit: $LAST_DEPLOYED_COMMIT"

log "Fetching latest code from origin/$TARGET_BRANCH..."
git fetch --prune origin "$TARGET_BRANCH"
REMOTE_COMMIT="$(git rev-parse "origin/$TARGET_BRANCH")"
log "Remote commit: $REMOTE_COMMIT"

if [[ -n "$EXPECTED_COMMIT" && "$REMOTE_COMMIT" != "$EXPECTED_COMMIT" ]]; then
    fatal "Expected commit $EXPECTED_COMMIT does not match origin/$TARGET_BRANCH ($REMOTE_COMMIT)"
fi

log "Pulling latest code (fast-forward only)..."
git pull --ff-only origin "$TARGET_BRANCH"
POST_PULL_COMMIT="$(git rev-parse HEAD)"
log "Post-pull commit: $POST_PULL_COMMIT"

if [[ "${DEPLOY_REEXECED:-0}" != "1" ]]; then
    export DEPLOY_REEXECED=1
    log "Re-executing deploy.sh to ensure the latest script version is active..."
    reexec_args=()
    if [[ -n "$BRANCH_OVERRIDE" ]]; then
        reexec_args+=(--branch "$BRANCH_OVERRIDE")
    fi
    if [[ -n "$EXPECTED_COMMIT" ]]; then
        reexec_args+=(--expect-commit "$EXPECTED_COMMIT")
    fi
    if [[ "$SKIP_DB_BACKUP" == "1" ]]; then
        reexec_args+=(--skip-db-backup)
    fi
    exec bash "$PROJECT_ROOT/scripts/deploy.sh" "${reexec_args[@]}"
fi

if [[ "$PRE_DEPLOY_COMMIT" == "$POST_PULL_COMMIT" ]]; then
    log "No new commit pulled. Continuing with full deterministic deploy pipeline."
    echo "NO_CHANGES" > "$MANIFEST_FILE"
else
    git diff --name-status "$PRE_DEPLOY_COMMIT" "$POST_PULL_COMMIT" > "$MANIFEST_FILE"
fi
log "Changed file manifest: $MANIFEST_FILE"

TOTAL_CHANGED_FILES="0"
BACKEND_CHANGED_FILES="0"
FRONTEND_CHANGED_FILES="0"
DOCS_CHANGED_FILES="0"
SCRIPTS_CHANGED_FILES="0"

if [[ "$PRE_DEPLOY_COMMIT" != "$POST_PULL_COMMIT" ]]; then
    TOTAL_CHANGED_FILES="$(wc -l < "$MANIFEST_FILE" | tr -d '[:space:]')"
    BACKEND_CHANGED_FILES="$(awk '{print $NF}' "$MANIFEST_FILE" | grep -E '^backend/' | wc -l | tr -d '[:space:]')"
    FRONTEND_CHANGED_FILES="$(awk '{print $NF}' "$MANIFEST_FILE" | grep -E '^frontend/' | wc -l | tr -d '[:space:]')"
    DOCS_CHANGED_FILES="$(awk '{print $NF}' "$MANIFEST_FILE" | grep -E '^docs/' | wc -l | tr -d '[:space:]')"
    SCRIPTS_CHANGED_FILES="$(awk '{print $NF}' "$MANIFEST_FILE" | grep -E '^scripts/' | wc -l | tr -d '[:space:]')"
fi

log "Release diff summary: total=$TOTAL_CHANGED_FILES backend=$BACKEND_CHANGED_FILES frontend=$FRONTEND_CHANGED_FILES docs=$DOCS_CHANGED_FILES scripts=$SCRIPTS_CHANGED_FILES"

MIGRATIONS_CHANGED="0"
if [[ "$PRE_DEPLOY_COMMIT" != "$POST_PULL_COMMIT" ]]; then
    if grep -E '^.[[:space:]]+backend/migrations/' "$MANIFEST_FILE" >/dev/null 2>&1; then
        MIGRATIONS_CHANGED="1"
    fi
fi
log "Migrations changed in this release: $MIGRATIONS_CHANGED"

if [[ "$SKIP_DB_BACKUP" != "1" ]]; then
    if command -v mysqldump >/dev/null 2>&1; then
        DB_HOST="$(grep -E '^DB_HOST=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '[:space:]')"
        DB_USER="$(grep -E '^DB_USER=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '[:space:]')"
        DB_NAME="$(grep -E '^DB_NAME=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '[:space:]')"
        DB_PASS="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '[:space:]')"
        DB_PASS="${DB_PASS:-$(grep -E '^DB_PASS=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '[:space:]')}"

        BACKUP_DIR="$PROJECT_ROOT/backups"
        mkdir -p "$BACKUP_DIR"
        BACKUP_FILE="$BACKUP_DIR/predeploy_${RUN_TS}.sql"
        log "Creating database backup at $BACKUP_FILE ..."

        if [[ -n "$DB_PASS" ]]; then
            MYSQL_PWD="$DB_PASS" mysqldump -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
        else
            mysqldump -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
        fi
        log "Database backup completed."
    else
        if [[ "$MIGRATIONS_CHANGED" == "1" ]]; then
            fatal "mysqldump is unavailable and migrations changed. Install mysqldump or use --skip-db-backup intentionally."
        fi
        warn "mysqldump not available. Skipping DB backup."
    fi
else
    warn "DB backup skipped by --skip-db-backup."
fi

log "Installing deterministic dependencies..."
npm ci --no-audit --no-fund
(cd "$BACKEND_DIR" && npm ci --no-audit --no-fund)
(cd "$FRONTEND_DIR" && npm ci --no-audit --no-fund)

log "Running documentation governance lint..."
npm run lint:docs

log "Running architecture gate checks..."
npm run check:architecture

log "Building frontend production artifacts..."
(cd "$FRONTEND_DIR" && NODE_ENV=production npm run build)

log "Running database migrations..."
(cd "$BACKEND_DIR" && npx sequelize-cli db:migrate)

log "Running optional maintenance hooks (if present)..."
run_optional_node_script "$BACKEND_DIR" "scripts/deploy_fix_precision.js" "precision hotfix v1"
run_optional_node_script "$BACKEND_DIR" "scripts/surgical_migrate.js" "surgical migration patch"
run_optional_node_script "$BACKEND_DIR" "scripts/deploy_fix_precision_v2.js" "precision hotfix v2"
run_optional_node_script "$BACKEND_DIR" "scripts/register_legacy_tenant.js" "legacy tenant registration"

log "Running schema/index audit..."
(cd "$BACKEND_DIR" && npm run audit:indexes)

log "Running billing-funnel telemetry audit..."
(cd "$BACKEND_DIR" && npm run audit:billing-funnel)

log "Running tenant schema sync..."
if [[ -f "$BACKEND_DIR/scripts/sync-tenant-schemas.js" ]]; then
    (cd "$BACKEND_DIR" && node scripts/sync-tenant-schemas.js)
else
    warn "sync-tenant-schemas.js not found; skipped."
fi

if command -v pm2 >/dev/null 2>&1; then
    log "Reloading PM2 services..."
    if [[ -f "$PROJECT_ROOT/ecosystem.config.cjs" ]]; then
        pm2 startOrReload "$PROJECT_ROOT/ecosystem.config.cjs" --env production --update-env
    elif [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
        pm2 startOrReload "$PROJECT_ROOT/ecosystem.config.js" --env production --update-env
    else
        fatal "No PM2 ecosystem config found."
    fi
    pm2 save
else
    fatal "pm2 is not installed; cannot restart services."
fi

BACKEND_PORT="$(grep -E '^PORT=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '[:space:]')"
BACKEND_PORT="${BACKEND_PORT:-5000}"
BACKEND_HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/health"
FRONTEND_HEALTH_URL="http://127.0.0.1:5173/"

log "Waiting for services to stabilize..."
sleep 12

require_command curl

backend_ok="0"
for attempt in {1..12}; do
    http_code="$(curl -s -o /tmp/skupervisor_backend_health.json -w '%{http_code}' "$BACKEND_HEALTH_URL" || true)"
    if [[ "$http_code" == "200" ]]; then
        backend_ok="1"
        break
    fi
    sleep 3
done
[[ "$backend_ok" == "1" ]] || fatal "Backend health check failed: $BACKEND_HEALTH_URL"

frontend_ok="0"
for attempt in {1..10}; do
    fe_code="$(curl -s -o /dev/null -w '%{http_code}' "$FRONTEND_HEALTH_URL" || true)"
    if [[ "$fe_code" == "200" ]]; then
        frontend_ok="1"
        break
    fi
    sleep 2
done
[[ "$frontend_ok" == "1" ]] || fatal "Frontend health check failed: $FRONTEND_HEALTH_URL"

run_optional_node_script "$BACKEND_DIR" "scripts/verify_production_billing.js" "production billing verification"

echo "$POST_PULL_COMMIT" > "$DEPLOY_STATE_DIR/last_deployed_commit"

{
    echo "deploy_timestamp=$RUN_TS"
    echo "target_branch=$TARGET_BRANCH"
    echo "previous_head=$PRE_DEPLOY_COMMIT"
    echo "deployed_head=$POST_PULL_COMMIT"
    echo "remote_head=$REMOTE_COMMIT"
    echo "expected_commit=${EXPECTED_COMMIT:-none}"
    echo "manifest_file=$MANIFEST_FILE"
    echo "log_file=$LOG_FILE"
    echo "migrations_changed=$MIGRATIONS_CHANGED"
    echo "total_changed_files=$TOTAL_CHANGED_FILES"
    echo "backend_changed_files=$BACKEND_CHANGED_FILES"
    echo "frontend_changed_files=$FRONTEND_CHANGED_FILES"
    echo "docs_changed_files=$DOCS_CHANGED_FILES"
    echo "scripts_changed_files=$SCRIPTS_CHANGED_FILES"
    echo "backend_health_url=$BACKEND_HEALTH_URL"
    echo "frontend_health_url=$FRONTEND_HEALTH_URL"
} > "$SUMMARY_FILE"

log "Deployment summary: $SUMMARY_FILE"
log "Deployment completed successfully."
