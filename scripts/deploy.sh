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

# ANSI Colors for high-visibility terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[1;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Force color output for sub-processes (npm, vite, git) even when piped thru tee
export FORCE_COLOR=1
export NPM_CONFIG_COLOR=always
export CLICOLOR_FORCE=1

# Track elapsed time (Bash built-in SECONDS resets to 0 here)
SECONDS=0

BRANCH_OVERRIDE=""
EXPECTED_COMMIT=""
SKIP_DB_BACKUP="0"
AUTO_MODE="0"
RUN_LEGACY_HOOKS="${DEPLOY_RUN_LEGACY_MAINTENANCE_HOOKS:-0}"
DEEP_VERIFY="${DEPLOY_POST_DEPLOY_VERIFY:-0}"

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
        --auto)
            AUTO_MODE="1"
            shift
            ;;
        --run-legacy-hooks)
            RUN_LEGACY_HOOKS="1"
            shift
            ;;
        --verify)
            DEEP_VERIFY="1"
            shift
            ;;
        --help)
            echo "Usage: bash scripts/deploy.sh [options]"
            echo ""
            echo "Options:"
            echo "  --branch <name>       Override target branch (default: current branch)"
            echo "  --expect-commit <sha> Require specific remote SHA"
            echo "  --auto                Unattended mode (auto-detect branch/commit, skip SHA match)"
            echo "  --skip-db-backup      Skip mysqldump before migrations"
            echo "  --run-legacy-hooks    Enable legacy maintenance scripts"
            echo "  --verify              Run deep AI verification after deploy"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Use --help for usage."
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

BACKUP_FILE=""

log() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] [${GREEN}INFO${NC}] $1"
}

warn() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] [${YELLOW}WARN${NC}] $1"
}

fatal() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] [${RED}ERROR${NC}] $1"
    exit 1
}

require_command() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || fatal "Missing required command: $cmd"
}

env_value() {
    local file="$1"
    local key="$2"
    awk -F= -v target="$key" '
        $0 !~ /^[[:space:]]*#/ && $1 == target {
            val = substr($0, index($0, "=") + 1)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
            print val
            exit
        }
    ' "$file"
}

run_step() {
    local label="$1"
    shift
    log "$label"
    "$@"
}

run_ci_if_lockfile_exists() {
    local dir="$1"
    local lock_file="$dir/package-lock.json"
    if [[ -f "$lock_file" ]]; then
        (cd "$dir" && npm ci --no-audit --no-fund)
    else
        warn "No package-lock.json in $dir, skipping npm ci there."
    fi
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

build_backend_health_candidates() {
    local explicit_url="${DEPLOY_BACKEND_HEALTH_URL:-}"
    local env_port="$1"
    local -a candidates=()
    local -a seen=()

    add_candidate() {
        local candidate="$1"
        [[ -z "$candidate" ]] && return 0
        for existing in "${seen[@]+"${seen[@]}"}"; do
            if [[ "$existing" == "$candidate" ]]; then
                return 0
            fi
        done
        seen+=("$candidate")
        candidates+=("$candidate")
    }

    if [[ -n "$explicit_url" ]]; then
        add_candidate "$explicit_url"
    fi

    if [[ -n "$env_port" ]]; then
        add_candidate "http://127.0.0.1:${env_port}/health"
    fi

    add_candidate "http://127.0.0.1:5000/health"
    add_candidate "http://127.0.0.1:5001/health"

    printf "%s\n" "${candidates[@]}"
}

# ---------------------------------------------------------------------------
# Cleanup function — runs on both success and failure
# ---------------------------------------------------------------------------
cleanup_temp_files() {
    rm -f "${TMPDIR:-/tmp}"/skupervisor_backend_health_*.json 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Rollback helper — called if post-deploy health check fails
# ---------------------------------------------------------------------------
rollback_to_commit() {
    local target_commit="$1"
    warn "Rolling back to pre-deploy commit $target_commit ..."

    cd "$PROJECT_ROOT"
    git checkout --force "$target_commit"

    run_ci_if_lockfile_exists "$PROJECT_ROOT"
    run_ci_if_lockfile_exists "$BACKEND_DIR"
    run_ci_if_lockfile_exists "$FRONTEND_DIR"

    bash -lc "cd \"$FRONTEND_DIR\" && NODE_ENV=production npm run build"

    if command -v pm2 >/dev/null 2>&1; then
        if [[ -f "$PROJECT_ROOT/ecosystem.config.cjs" ]]; then
            pm2 startOrReload "$PROJECT_ROOT/ecosystem.config.cjs" --env production --update-env
        elif [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
            pm2 startOrReload "$PROJECT_ROOT/ecosystem.config.js" --env production --update-env
        fi
        pm2 save
    fi

    warn "Rollback complete. Server is back on commit $target_commit."
}

# ---------------------------------------------------------------------------
# Deploy log rotation — keep only the latest N sets
# ---------------------------------------------------------------------------
rotate_deploy_logs() {
    local keep="${1:-30}"

    # Rotate main log files
    ls -1t "$DEPLOY_LOG_DIR"/deploy_*.log 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f

    # Rotate changed-files manifests
    ls -1t "$DEPLOY_LOG_DIR"/deploy_*.changed_files.txt 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f

    # Rotate summary files
    ls -1t "$DEPLOY_LOG_DIR"/deploy_*.summary.txt 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f
}

trap 'cleanup_temp_files; fatal "Deployment failed at line $LINENO. See $LOG_FILE"' ERR
trap 'cleanup_temp_files' EXIT

# ===========================================================================
# Pre-flight checks
# ===========================================================================

require_command git
require_command npm
require_command node
require_command npx
require_command bash
require_command curl

# Validate Node.js minimum version (project requires >= 18.0.0)
NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
    fatal "Node.js >= 18.0.0 required. Current: $(node --version)"
fi

if command -v flock >/dev/null 2>&1; then
    if [[ "${DEPLOY_LOCK_ACQUIRED:-0}" != "1" ]]; then
        exec 9>"$LOCK_FILE"
        flock -n 9 || fatal "Another deployment appears to be running (lock: $LOCK_FILE)"
        export DEPLOY_LOCK_ACQUIRED=1
    else
        log "Deployment lock inherited from prior script exec."
    fi
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
    value="$(env_value "$ENV_FILE" "$var")"
    if [[ -z "${value:-}" ]]; then
        fatal "Missing required env variable ${var} in backend/.env"
    fi
done
log "Required env validation passed."

PAYPAL_MODE_VALUE="$(env_value "$ENV_FILE" "PAYPAL_MODE")"
if [[ "$PAYPAL_MODE_VALUE" != "live" && "$PAYPAL_MODE_VALUE" != "sandbox" ]]; then
    fatal "PAYPAL_MODE must be either 'live' or 'sandbox'. Current value: $PAYPAL_MODE_VALUE"
fi
if [[ "${DEPLOY_REQUIRE_LIVE_PAYPAL:-0}" == "1" && "$PAYPAL_MODE_VALUE" != "live" ]]; then
    fatal "DEPLOY_REQUIRE_LIVE_PAYPAL=1 but PAYPAL_MODE is '$PAYPAL_MODE_VALUE'. Refusing production deploy."
fi

PAYPAL_STANDARD_PLAN_ID_VALUE="$(env_value "$ENV_FILE" "PAYPAL_STANDARD_PLAN_ID")"
PAYPAL_PREMIUM_PLAN_ID_VALUE="$(env_value "$ENV_FILE" "PAYPAL_PREMIUM_PLAN_ID")"
PAYPAL_LEGACY_PLAN_ID_VALUE="$(env_value "$ENV_FILE" "PAYPAL_PLAN_ID")"

if [[ -z "${PAYPAL_STANDARD_PLAN_ID_VALUE:-}" ]]; then
    fatal "Missing required env variable PAYPAL_STANDARD_PLAN_ID in backend/.env"
fi
if [[ -z "${PAYPAL_PREMIUM_PLAN_ID_VALUE:-}" && -z "${PAYPAL_LEGACY_PLAN_ID_VALUE:-}" ]]; then
    fatal "Missing required env variable PAYPAL_PREMIUM_PLAN_ID (or legacy PAYPAL_PLAN_ID) in backend/.env"
fi
if [[ -z "${PAYPAL_PREMIUM_PLAN_ID_VALUE:-}" && -n "${PAYPAL_LEGACY_PLAN_ID_VALUE:-}" ]]; then
    warn "Using legacy PAYPAL_PLAN_ID fallback for premium plan. Prefer setting PAYPAL_PREMIUM_PLAN_ID."
fi

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

if [[ "$AUTO_MODE" == "1" ]]; then
    log "Auto-mode enabled: skipping SHA match requirement (Target SHA: $REMOTE_COMMIT)"
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
    if [[ "$RUN_LEGACY_HOOKS" == "1" ]]; then
        reexec_args+=(--run-legacy-hooks)
    fi
    if [[ "$AUTO_MODE" == "1" ]]; then
        reexec_args+=(--auto)
    fi
    if [[ "$DEEP_VERIFY" == "1" ]]; then
        reexec_args+=(--verify)
    fi
    exec bash "$PROJECT_ROOT/scripts/deploy.sh" ${reexec_args[@]+"${reexec_args[@]}"}
fi

# ===========================================================================
# Deploy banner
# ===========================================================================
SHORT_OLD="${PRE_DEPLOY_COMMIT:0:10}"
SHORT_NEW="${POST_PULL_COMMIT:0:10}"

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║           SKU INVENTORY MANAGER — PRODUCTION DEPLOY      ║${NC}"
echo -e "${CYAN}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}${BOLD}║${NC}  Branch : ${YELLOW}$TARGET_BRANCH${NC}"
echo -e "${CYAN}${BOLD}║${NC}  Commit : ${YELLOW}$SHORT_OLD${NC} → ${GREEN}$SHORT_NEW${NC}"
echo -e "${CYAN}${BOLD}║${NC}  Time   : ${YELLOW}$(date +'%Y-%m-%d %H:%M:%S %Z')${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

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

# ===========================================================================
# Database backup
# ===========================================================================
if [[ "$SKIP_DB_BACKUP" != "1" ]]; then
    if command -v mysqldump >/dev/null 2>&1; then
        DB_HOST="$(env_value "$ENV_FILE" "DB_HOST")"
        DB_USER="$(env_value "$ENV_FILE" "DB_USER")"
        DB_NAME="$(env_value "$ENV_FILE" "DB_NAME")"
        DB_PASS="$(env_value "$ENV_FILE" "DB_PASSWORD")"
        DB_PASS="${DB_PASS:-$(env_value "$ENV_FILE" "DB_PASS")}"

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

        # Keep only the latest 20 SQL backups to avoid unbounded disk growth.
        ls -1t "$BACKUP_DIR"/predeploy_*.sql 2>/dev/null | tail -n +21 | xargs -r rm -f
    else
        if [[ "$MIGRATIONS_CHANGED" == "1" ]]; then
            fatal "mysqldump is unavailable and migrations changed. Install mysqldump or use --skip-db-backup intentionally."
        fi
        warn "mysqldump not available. Skipping DB backup."
    fi
else
    warn "DB backup skipped by --skip-db-backup."
fi

# ===========================================================================
# Dependencies, linting, and build
# ===========================================================================
run_step "Installing deterministic dependencies..." run_ci_if_lockfile_exists "$PROJECT_ROOT"
run_ci_if_lockfile_exists "$BACKEND_DIR"
run_ci_if_lockfile_exists "$FRONTEND_DIR"

run_step "Running documentation governance lint..." npm run lint:docs

run_step "Running architecture gate checks..." npm run check:architecture

run_step "Building frontend production artifacts..." bash -lc "cd \"$FRONTEND_DIR\" && NODE_ENV=production npm run build"

# ===========================================================================
# Database migrations
# ===========================================================================
run_step "Running database migration status (pre-check)..." bash -lc "cd \"$BACKEND_DIR\" && npx sequelize-cli db:migrate:status || true"
run_step "Running database migrations..." bash -lc "cd \"$BACKEND_DIR\" && npx sequelize-cli db:migrate"
run_step "Running database migration status (post-check)..." bash -lc "cd \"$BACKEND_DIR\" && npx sequelize-cli db:migrate:status || true"
run_step "Normalizing original legacy tenant account..." bash -lc "cd \"$BACKEND_DIR\" && node scripts/register_original_tenant.js --apply"
run_step "Auditing original legacy tenant invariants..." bash -lc "cd \"$BACKEND_DIR\" && node scripts/audit_original_legacy_account.js --strict"

# ===========================================================================
# Optional legacy hooks
# ===========================================================================
if [[ "$RUN_LEGACY_HOOKS" == "1" ]]; then
    log "Running optional maintenance hooks (enabled)..."
    run_optional_node_script "$BACKEND_DIR" "scripts/deploy_fix_precision.js" "precision hotfix v1"
    run_optional_node_script "$BACKEND_DIR" "scripts/surgical_migrate.js" "surgical migration patch"
    run_optional_node_script "$BACKEND_DIR" "scripts/deploy_fix_precision_v2.js" "precision hotfix v2"
    run_optional_node_script "$BACKEND_DIR" "scripts/register_legacy_tenant.js" "legacy tenant registration"
else
    warn "Skipping legacy maintenance hooks by default. Use --run-legacy-hooks (or DEPLOY_RUN_LEGACY_MAINTENANCE_HOOKS=1) only for targeted recovery."
fi

# ===========================================================================
# Index repair and audits
# ===========================================================================
log "Repairing required schema indexes (self-heal pass)..."
if ! (cd "$BACKEND_DIR" && npm run repair:indexes); then
    warn "Index self-heal did not fully converge. Continuing to strict schema/index audit gate."
fi

run_step "Running schema/index audit..." bash -lc "cd \"$BACKEND_DIR\" && npm run audit:indexes"

run_step "Running billing-funnel telemetry audit..." bash -lc "cd \"$BACKEND_DIR\" && npm run audit:billing-funnel"

# ===========================================================================
# Tenant schema sync
# ===========================================================================
log "Running tenant schema sync..."
if [[ -f "$BACKEND_DIR/scripts/sync-tenant-schemas.js" ]]; then
    (cd "$BACKEND_DIR" && node scripts/sync-tenant-schemas.js)
else
    warn "sync-tenant-schemas.js not found; skipped."
fi

# ===========================================================================
# PM2 reload
# ===========================================================================
if command -v pm2 >/dev/null 2>&1; then
    log "Reloading PM2 services..."
    if [[ -f "$PROJECT_ROOT/ecosystem.config.cjs" ]]; then
        pm2 startOrReload "$PROJECT_ROOT/ecosystem.config.cjs" --env production --update-env
    elif [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
        pm2 startOrReload "$PROJECT_ROOT/ecosystem.config.js" --env production --update-env
    else
        fatal "No PM2 ecosystem config found."
    fi
    if pm2 list --no-color | grep -Eiq 'errored|stopped'; then
        pm2 list --no-color || true
        fatal "PM2 reports errored/stopped processes after reload."
    fi
    pm2 save
else
    fatal "pm2 is not installed; cannot restart services."
fi

# ===========================================================================
# Health checks with automatic rollback
# ===========================================================================
BACKEND_PORT="$(env_value "$ENV_FILE" "PORT")"
BACKEND_PORT="${BACKEND_PORT:-5000}"
BACKEND_HEALTH_URL=""
FRONTEND_HEALTH_URL="${DEPLOY_FRONTEND_HEALTH_URL:-}"
mapfile -t BACKEND_HEALTH_CANDIDATES < <(build_backend_health_candidates "$BACKEND_PORT")

log "Waiting for services to stabilize..."
sleep 12

log "Backend health candidates: ${BACKEND_HEALTH_CANDIDATES[*]}"
backend_ok="0"
declare -a backend_attempt_diagnostics=()
health_tmp_dir="${TMPDIR:-/tmp}"
mkdir -p "$health_tmp_dir"
for candidate_url in "${BACKEND_HEALTH_CANDIDATES[@]}"; do
    for attempt in {1..12}; do
        body_file="$health_tmp_dir/skupervisor_backend_health_${attempt}.json"
        http_code="$(curl -s -o "$body_file" -w '%{http_code}' "$candidate_url" || true)"
        if [[ "$http_code" == "200" ]]; then
            backend_ok="1"
            BACKEND_HEALTH_URL="$candidate_url"
            break 2
        fi
        if [[ "$attempt" == "12" ]]; then
            if [[ -f "$body_file" ]]; then
                response_preview="$(tr '\n' ' ' < "$body_file" | cut -c1-220)"
            else
                response_preview="<no response body captured>"
            fi
            backend_attempt_diagnostics+=("url=$candidate_url code=$http_code body='${response_preview}'")
        fi
        sleep 3
    done
done

if [[ "$backend_ok" != "1" ]]; then
    warn "Backend health diagnostics:"
    for diagnostic in "${backend_attempt_diagnostics[@]+"${backend_attempt_diagnostics[@]}"}"; do
        warn "  $diagnostic"
    done
    pm2 list --no-color || true
    pm2 logs sku-backend --nostream --lines 80 || true

    # ---------- Automatic rollback ----------
    if [[ "$PRE_DEPLOY_COMMIT" != "$POST_PULL_COMMIT" ]]; then
        warn "Attempting automatic rollback to previous working commit..."
        rollback_to_commit "$PRE_DEPLOY_COMMIT"
        fatal "Backend health check failed on all candidates. ROLLED BACK to $PRE_DEPLOY_COMMIT. Investigate and redeploy."
    else
        fatal "Backend health check failed on all candidates (no code change to rollback)."
    fi
fi

log "Backend health check passed: $BACKEND_HEALTH_URL"

if [[ -n "$FRONTEND_HEALTH_URL" ]]; then
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
else
    warn "DEPLOY_FRONTEND_HEALTH_URL not set. Skipping frontend HTTP health check."
fi

run_optional_node_script "$BACKEND_DIR" "scripts/verify_production_billing.js" "production billing verification"

# ===========================================================================
# Deep AI Verification (Optional Gate)
# ===========================================================================
if [[ "$DEEP_VERIFY" == "1" ]]; then
    run_step "Running Deep AI Verification (30-Questions Gate)..." bash -lc "cd \"$BACKEND_DIR\" && node scripts/qa_30_questions_verification.js"
fi

# ===========================================================================
# Finalize
# ===========================================================================
echo "$POST_PULL_COMMIT" > "$DEPLOY_STATE_DIR/last_deployed_commit"

# Rotate deploy logs (keep latest 30 sets)
rotate_deploy_logs 30

# Clean up lock file explicitly (fd 9 auto-closes on exit, but this is clearer)
rm -f "$LOCK_FILE" 2>/dev/null || true

# Calculate elapsed time
ELAPSED="$SECONDS"
ELAPSED_MIN="$((ELAPSED / 60))"
ELAPSED_SEC="$((ELAPSED % 60))"

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
    echo "db_backup_file=${BACKUP_FILE:-none}"
    echo "total_changed_files=$TOTAL_CHANGED_FILES"
    echo "backend_changed_files=$BACKEND_CHANGED_FILES"
    echo "frontend_changed_files=$FRONTEND_CHANGED_FILES"
    echo "docs_changed_files=$DOCS_CHANGED_FILES"
    echo "scripts_changed_files=$SCRIPTS_CHANGED_FILES"
    echo "backend_health_url=$BACKEND_HEALTH_URL"
    echo "frontend_health_url=$FRONTEND_HEALTH_URL"
    echo "elapsed_seconds=$ELAPSED"
} > "$SUMMARY_FILE"

log "Deployment summary: $SUMMARY_FILE"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           DEPLOYMENT COMPLETED SUCCESSFULLY              ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Commit  : ${GREEN}${POST_PULL_COMMIT:0:10}${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Duration: ${YELLOW}${ELAPSED_MIN}m ${ELAPSED_SEC}s${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Health  : ${GREEN}✓ Backend${NC}  ${FRONTEND_HEALTH_URL:+${GREEN}✓ Frontend${NC}}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
