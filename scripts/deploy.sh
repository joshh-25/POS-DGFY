#!/usr/bin/env bash

# Production deployment pipeline with evidence logging and strict gates.
# Run this on the production server from the repository root:
#   bash scripts/deploy.sh [--branch <name>] [--expect-commit <sha>] [--skip-db-backup]

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/apps/dgfy-web"
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
VERIFY_PUBLIC_ENDPOINTS="${DEPLOY_VERIFY_PUBLIC_ENDPOINTS:-1}"
FRONTEND_ASSET_PARITY_STRICT="${DEPLOY_FRONTEND_ASSET_PARITY_STRICT:-1}"
STRICT_LEGACY_AUDIT="${DEPLOY_STRICT_LEGACY_AUDIT:-0}"
WINDOWS_LOCK_CLEANUP_MODE="${DEPLOY_WINDOWS_LOCK_CLEANUP:-auto}"
WINDOWS_LOCK_CLEANUP_DELAY_SECONDS="${DEPLOY_WINDOWS_LOCK_CLEANUP_DELAY_SECONDS:-2}"
STORE_BASE_PATH="${DEPLOY_STORE_BASE_PATH:-/}"
if [[ "$STORE_BASE_PATH" != /* ]]; then
    STORE_BASE_PATH="/$STORE_BASE_PATH"
fi
STORE_BASE_PATH="${STORE_BASE_PATH%/}/"

strip_cr() {
    printf '%s' "$1" | tr -d '\r'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --branch)
            BRANCH_OVERRIDE="$(strip_cr "${2:-}")"
            shift 2
            ;;
        --expect-commit)
            EXPECTED_COMMIT="$(strip_cr "${2:-}")"
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
            echo ""
            echo "Environment overrides:"
            echo "  PAYMENTS_ENABLED=true|false (read from backend/.env; default false)"
            echo "  DEPLOY_RUN_BILLING_VERIFY=auto|0|1 (default auto)"
            echo "  DEPLOY_STORE_BASE_PATH=/"
            echo "  DEPLOY_VERIFY_PUBLIC_ENDPOINTS=1"
            echo "  DEPLOY_FRONTEND_ASSET_PARITY_STRICT=1"
            echo "  DEPLOY_STRICT_LEGACY_AUDIT=1"
            echo "  DEPLOY_TENANT_SCHEMA_SYNC_MODE=report|alter (default report)"
            echo "  DEPLOY_TENANT_SYNC_REQUIRE_ZERO=0|1 (default 1)"
            echo "  DEPLOY_TENANT_INDEX_HEADROOM_STRICT=0|1 (default 1)"
            echo "  DEPLOY_NPM_CI_RETRIES=<n> (default 3)"
            echo "  DEPLOY_NPM_CI_RETRY_DELAY_SECONDS=<n> (default 5)"
            echo "  DEPLOY_WINDOWS_LOCK_CLEANUP=auto|0|1 (default auto)"
            echo "  DEPLOY_WINDOWS_LOCK_CLEANUP_DELAY_SECONDS=<n> (default 2)"
            echo "  DEPLOY_VERIFY_TENANT_NAME=<tenant name> (default Premium Corp)"
            echo "  DEPLOY_VERIFY_TENANT_TOKEN=<company token>"
            echo "  DEPLOY_VERIFY_SKIP_IF_MISSING=0|1 (default 1)"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Use --help for usage."
            exit 1
            ;;
    esac
done

if [[ -n "$EXPECTED_COMMIT" && ! "$EXPECTED_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "Invalid --expect-commit value after CRLF normalization: '$EXPECTED_COMMIT'"
    exit 1
fi

mkdir -p "$DEPLOY_LOG_DIR" "$DEPLOY_STATE_DIR"
RUN_TS="$(date +'%Y%m%d_%H%M%S')"
LOG_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.log"
MANIFEST_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.changed_files.txt"
SUMMARY_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.summary.txt"
FRONTEND_BUILD_MANIFEST_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.frontend_build_manifest.json"

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

is_http_success_code() {
    local code="$1"
    [[ "$code" =~ ^2[0-9][0-9]$ || "$code" =~ ^3[0-9][0-9]$ ]]
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
        run_npm_ci_with_retry "$dir"
    else
        warn "No package-lock.json in $dir, skipping npm ci there."
    fi
}

run_npm_ci_with_retry() {
    local dir="$1"
    local attempts="${DEPLOY_NPM_CI_RETRIES:-3}"
    local delay_seconds="${DEPLOY_NPM_CI_RETRY_DELAY_SECONDS:-5}"

    if ! [[ "$attempts" =~ ^[0-9]+$ ]] || [[ "$attempts" -lt 1 ]]; then
        warn "Invalid DEPLOY_NPM_CI_RETRIES='$attempts'. Falling back to 3."
        attempts=3
    fi
    if ! [[ "$delay_seconds" =~ ^[0-9]+$ ]] || [[ "$delay_seconds" -lt 1 ]]; then
        warn "Invalid DEPLOY_NPM_CI_RETRY_DELAY_SECONDS='$delay_seconds'. Falling back to 5."
        delay_seconds=5
    fi
    if ! [[ "$WINDOWS_LOCK_CLEANUP_DELAY_SECONDS" =~ ^[0-9]+$ ]] || [[ "$WINDOWS_LOCK_CLEANUP_DELAY_SECONDS" -lt 0 ]]; then
        warn "Invalid DEPLOY_WINDOWS_LOCK_CLEANUP_DELAY_SECONDS='$WINDOWS_LOCK_CLEANUP_DELAY_SECONDS'. Falling back to 2."
        WINDOWS_LOCK_CLEANUP_DELAY_SECONDS=2
    fi

    run_windows_lock_cleanup "pre-npm-ci in $dir"

    local attempt
    for ((attempt=1; attempt<=attempts; attempt++)); do
        if (cd "$dir" && npm ci --no-audit --no-fund); then
            if [[ "$attempt" -gt 1 ]]; then
                log "npm ci succeeded on retry $attempt/$attempts in $dir."
            fi
            return 0
        fi

        if [[ "$attempt" -lt "$attempts" ]]; then
            run_windows_lock_cleanup "post-failed npm ci attempt $attempt/$attempts in $dir"
            warn "npm ci attempt $attempt/$attempts failed in $dir. Retrying after ${delay_seconds}s (common cause: transient file lock/EPERM)."
            sleep "$delay_seconds"
        fi
    done

    fatal "npm ci failed after $attempts attempt(s) in $dir."
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

is_windows_runtime() {
    local uname_out
    uname_out="$(uname -s 2>/dev/null || echo unknown)"
    case "$uname_out" in
        *MINGW*|*MSYS*|*CYGWIN*|*NT*) return 0 ;;
        *) return 1 ;;
    esac
}

is_truthy() {
    local value
    value="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')"
    [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

is_falsy() {
    local value
    value="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')"
    [[ "$value" == "0" || "$value" == "false" || "$value" == "no" || "$value" == "off" ]]
}

should_run_windows_lock_cleanup() {
    if is_falsy "$WINDOWS_LOCK_CLEANUP_MODE"; then
        return 1
    fi
    if is_truthy "$WINDOWS_LOCK_CLEANUP_MODE"; then
        return 0
    fi
    if [[ "$WINDOWS_LOCK_CLEANUP_MODE" == "auto" ]]; then
        is_windows_runtime
        return $?
    fi
    warn "Unknown DEPLOY_WINDOWS_LOCK_CLEANUP='$WINDOWS_LOCK_CLEANUP_MODE'. Falling back to auto."
    is_windows_runtime
}

run_windows_lock_cleanup() {
    local reason="${1:-unspecified}"
    if ! should_run_windows_lock_cleanup; then
        return 0
    fi

    local ps_shell=""
    if command -v powershell.exe >/dev/null 2>&1; then
        ps_shell="powershell.exe"
    elif command -v pwsh >/dev/null 2>&1; then
        ps_shell="pwsh"
    elif command -v powershell >/dev/null 2>&1; then
        ps_shell="powershell"
    else
        warn "Windows lock cleanup requested, but no PowerShell executable was found."
        return 0
    fi

    log "Running Windows process-lock cleanup ($reason)..."
    local ps_script
    ps_script="\$names=@('node','esbuild'); Get-Process -ErrorAction SilentlyContinue | Where-Object { \$names -contains \$_.ProcessName } | Stop-Process -Force -ErrorAction SilentlyContinue"
    "$ps_shell" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ps_script" >/dev/null 2>&1 || true

    if [[ "$WINDOWS_LOCK_CLEANUP_DELAY_SECONDS" -gt 0 ]]; then
        sleep "$WINDOWS_LOCK_CLEANUP_DELAY_SECONDS"
    fi
}

frontend_script_exists() {
    local script_name="$1"
    (
        cd "$FRONTEND_DIR" && node -e "const pkg=require('./package.json'); process.exit(pkg?.scripts && pkg.scripts['$script_name'] ? 0 : 1);"
    )
}

run_frontend_builds() {
    local skupervisor_config="$FRONTEND_DIR/apps/skupervisor/vite.config.js"
    local pos_config="$FRONTEND_DIR/apps/pos/vite.config.js"
    local store_config="$FRONTEND_DIR/apps/store/vite.config.js"
    local ran_any="0"

    if frontend_script_exists "build:skupervisor"; then
        (cd "$FRONTEND_DIR" && NODE_ENV=production npm run build:skupervisor)
        ran_any="1"
    elif [[ -f "$skupervisor_config" ]]; then
        (cd "$FRONTEND_DIR" && NODE_ENV=production npx vite build --config apps/skupervisor/vite.config.js)
        ran_any="1"
    elif frontend_script_exists "build"; then
        (cd "$FRONTEND_DIR" && NODE_ENV=production npm run build)
        ran_any="1"
    fi

    if frontend_script_exists "build:pos"; then
        (cd "$FRONTEND_DIR" && NODE_ENV=production npm run build:pos)
        ran_any="1"
    elif [[ -f "$pos_config" ]]; then
        (cd "$FRONTEND_DIR" && NODE_ENV=production npx vite build --config apps/pos/vite.config.js)
        ran_any="1"
    else
        warn "POS build surface not found (no build:pos script and no apps/pos config)."
    fi

    if frontend_script_exists "build:store"; then
        (cd "$FRONTEND_DIR" && NODE_ENV=production VITE_STORE_BASE_PATH="$STORE_BASE_PATH" npm run build:store)
        ran_any="1"
    elif [[ -f "$store_config" ]]; then
        (cd "$FRONTEND_DIR" && NODE_ENV=production VITE_STORE_BASE_PATH="$STORE_BASE_PATH" npx vite build --config apps/store/vite.config.js)
        ran_any="1"
    else
        warn "Store build surface not found (no build:store script and no apps/store config)."
    fi

    if [[ "$ran_any" != "1" ]]; then
        fatal "No frontend build path could be resolved."
    fi
}

ensure_nginx_upload_body_limit() {
    local limit="${DEPLOY_NGINX_CLIENT_MAX_BODY_SIZE:-8m}"
    local conf_dir="/etc/nginx/conf.d"
    local conf_file="$conf_dir/skupervisor-client-body-size.conf"

    if ! command -v nginx >/dev/null 2>&1; then
        warn "nginx command not found; skipping storefront upload ingress size guard."
        return 0
    fi

    if [[ ! -d "$conf_dir" || ! -w "$conf_dir" ]]; then
        warn "Cannot write $conf_dir; skipping storefront upload ingress size guard."
        return 0
    fi

    cat > "$conf_file" <<EOF
# Managed by SKU Inventory Manager deploy.sh.
# Backend storefront asset uploads allow 5 MiB files; this leaves room for multipart overhead.
client_max_body_size $limit;
EOF

    if nginx -t; then
        if command -v systemctl >/dev/null 2>&1; then
            systemctl reload nginx
        elif command -v service >/dev/null 2>&1; then
            service nginx reload
        else
            nginx -s reload
        fi
        log "Nginx upload ingress size guard active: client_max_body_size=$limit."
    else
        rm -f "$conf_file"
        fatal "Nginx config test failed after writing $conf_file; removed guard file."
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

build_surface_health_candidates() {
    local explicit_url="$1"
    shift
    local -a defaults=("$@")
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

    add_candidate "$explicit_url"
    for candidate in "${defaults[@]+"${defaults[@]}"}"; do
        add_candidate "$candidate"
    done

    printf "%s\n" "${candidates[@]}"
}

probe_url_candidates() {
    local label="$1"
    local out_var_name="$2"
    local attempts="$3"
    local delay_seconds="$4"
    shift 4
    local -a candidates=("$@")

    local chosen_url=""
    for candidate_url in "${candidates[@]+"${candidates[@]}"}"; do
        for ((attempt=1; attempt<=attempts; attempt++)); do
            http_code="$(curl -sS -L -o /dev/null -w '%{http_code}' "$candidate_url" || true)"
            if is_http_success_code "$http_code"; then
                chosen_url="$candidate_url"
                break 2
            fi
            sleep "$delay_seconds"
        done
    done

    if [[ -n "$chosen_url" ]]; then
        printf -v "$out_var_name" '%s' "$chosen_url"
        log "$label check passed: $chosen_url"
        return 0
    fi

    warn "$label check failed. Candidates tested: ${candidates[*]}"
    return 1
}

resolve_url_from_page() {
    local page_url="$1"
    local ref="$2"

    if [[ "$ref" =~ ^https?:// ]]; then
        printf "%s\n" "$ref"
        return 0
    fi

    if [[ "$ref" =~ ^// ]]; then
        printf "https:%s\n" "$ref"
        return 0
    fi

    local page_origin
    page_origin="$(printf '%s' "$page_url" | sed -E 's#^(https?://[^/]+).*$#\1#')"

    if [[ "$ref" == /* ]]; then
        printf "%s%s\n" "$page_origin" "$ref"
        return 0
    fi

    local page_dir
    page_dir="$(printf '%s' "$page_url" | sed -E 's#[?#].*$##' | sed -E 's#[^/]*$##')"
    printf "%s%s\n" "$page_dir" "$ref"
}

verify_tenant_store_asset_integrity() {
    local tenant_store_url="$1"
    local html
    html="$(curl -sS -L "$tenant_store_url" || true)"
    if [[ -z "$html" ]]; then
        warn "Tenant Store asset-integrity check failed: empty HTML response from $tenant_store_url"
        return 1
    fi

    local script_ref
    script_ref="$(printf '%s\n' "$html" | sed -nE 's@.*<script[^>]*src="([^"]+)".*@\1@p' | head -n 1)"
    local manifest_ref
    manifest_ref="$(printf '%s\n' "$html" | sed -nE 's@.*<link[^>]*rel="manifest"[^>]*href="([^"]+)".*@\1@p' | head -n 1)"

    if [[ -z "$script_ref" ]]; then
        warn "Tenant Store asset-integrity check failed: no <script src> found in $tenant_store_url"
        return 1
    fi
    if [[ -z "$manifest_ref" ]]; then
        warn "Tenant Store asset-integrity check failed: no manifest href found in $tenant_store_url"
        return 1
    fi

    local script_url
    script_url="$(resolve_url_from_page "$tenant_store_url" "$script_ref")"
    local manifest_url
    manifest_url="$(resolve_url_from_page "$tenant_store_url" "$manifest_ref")"

    local script_code script_type manifest_code manifest_type
    read -r script_code script_type <<<"$(curl -sS -L -o /dev/null -w '%{http_code} %{content_type}' "$script_url" || echo "000 unknown")"
    read -r manifest_code manifest_type <<<"$(curl -sS -L -o /dev/null -w '%{http_code} %{content_type}' "$manifest_url" || echo "000 unknown")"
    script_type="${script_type,,}"
    manifest_type="${manifest_type,,}"

    if ! is_http_success_code "$script_code"; then
        warn "Tenant Store asset-integrity check failed: script URL returned HTTP $script_code ($script_url)"
        return 1
    fi
    if [[ "$script_type" == text/html* || "$script_type" == application/xhtml* ]]; then
        warn "Tenant Store asset-integrity check failed: script URL served HTML content-type ($script_type) ($script_url)"
        return 1
    fi

    if ! is_http_success_code "$manifest_code"; then
        warn "Tenant Store asset-integrity check failed: manifest URL returned HTTP $manifest_code ($manifest_url)"
        return 1
    fi
    if [[ "$manifest_type" == text/html* || "$manifest_type" == application/xhtml* ]]; then
        warn "Tenant Store asset-integrity check failed: manifest URL served HTML content-type ($manifest_type) ($manifest_url)"
        return 1
    fi

    log "Tenant Store asset integrity check passed: script=$script_url ($script_type), manifest=$manifest_url ($manifest_type)"
    return 0
}

run_frontend_asset_parity_checks() {
    local ims_url="$1"
    local pos_url="$2"
    local tenant_store_url="$3"

    local parity_script="$PROJECT_ROOT/scripts/check-frontend-asset-parity.js"
    [[ -f "$parity_script" ]] || fatal "Frontend asset parity script missing: $parity_script"

    log "Running frontend asset parity checks against public endpoints..."
    node "$parity_script" --label "IMS" --local-index "$PROJECT_ROOT/dist-apps/skupervisor/index.html" --public-url "$ims_url"
    node "$parity_script" --label "POS" --local-index "$PROJECT_ROOT/dist-apps/pos/index.html" --public-url "$pos_url"
    node "$parity_script" --label "Tenant Store" --local-index "$PROJECT_ROOT/dist-apps/store/index.html" --public-url "$tenant_store_url"
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
    rotate_deploy_log_group "deploy_*.log" "$keep"
    rotate_deploy_log_group "deploy_*.changed_files.txt" "$keep"
    rotate_deploy_log_group "deploy_*.summary.txt" "$keep"
}

rotate_deploy_log_group() {
    local pattern="$1"
    local keep="$2"
    local -a files=()

    while IFS= read -r file_path; do
        files+=("$file_path")
    done < <(
        find "$DEPLOY_LOG_DIR" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' 2>/dev/null \
            | sort -rn \
            | awk '{ $1=""; sub(/^ /, ""); print }'
    )

    if [[ "${#files[@]}" -le "$keep" ]]; then
        return 0
    fi

    local idx
    for ((idx=keep; idx<${#files[@]}; idx++)); do
        rm -f -- "${files[$idx]}"
    done
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

HOSTING_PROFILE_RAW="$(env_value "$ENV_FILE" "HOSTING_PROFILE")"
[[ -n "${HOSTING_PROFILE_RAW:-}" ]] || fatal "Missing required env variable HOSTING_PROFILE in backend/.env"
if ! node "$PROJECT_ROOT/scripts/check-hosting-profile.js" --profile "$HOSTING_PROFILE_RAW" --env-file "$ENV_FILE"; then
    fatal "Production environment validation failed for HOSTING_PROFILE=$HOSTING_PROFILE_RAW"
fi
log "Production environment validation passed (profile=$HOSTING_PROFILE_RAW)."

REQUIRED_ENV_VARS=("DB_HOST" "DB_USER" "DB_NAME" "JWT_SECRET")
for var in "${REQUIRED_ENV_VARS[@]}"; do
    value="$(env_value "$ENV_FILE" "$var")"
    if [[ -z "${value:-}" ]]; then
        fatal "Missing required env variable ${var} in backend/.env"
    fi
done
log "Required env validation passed."

run_step "Ensuring storefront upload ingress body limit..." ensure_nginx_upload_body_limit

validate_paypal_env() {
    local paypal_mode
    local paypal_standard_plan
    local paypal_premium_plan
    local paypal_legacy_plan
    local required_paypal_vars=("PAYPAL_CLIENT_ID" "PAYPAL_CLIENT_SECRET" "PAYPAL_WEBHOOK_ID" "PAYPAL_STANDARD_PLAN_ID")

    for var in "${required_paypal_vars[@]}"; do
        value="$(env_value "$ENV_FILE" "$var")"
        if [[ -z "${value:-}" ]]; then
            fatal "Missing required PayPal env variable ${var} in backend/.env"
        fi
    done

    paypal_mode="$(env_value "$ENV_FILE" "PAYPAL_MODE")"
    if [[ "$paypal_mode" != "live" && "$paypal_mode" != "sandbox" ]]; then
        fatal "PAYPAL_MODE must be either 'live' or 'sandbox'. Current value: ${paypal_mode:-<empty>}"
    fi
    if [[ "${DEPLOY_REQUIRE_LIVE_PAYPAL:-0}" == "1" && "$paypal_mode" != "live" ]]; then
        fatal "DEPLOY_REQUIRE_LIVE_PAYPAL=1 but PAYPAL_MODE is '$paypal_mode'. Refusing production deploy."
    fi

    paypal_standard_plan="$(env_value "$ENV_FILE" "PAYPAL_STANDARD_PLAN_ID")"
    paypal_premium_plan="$(env_value "$ENV_FILE" "PAYPAL_PREMIUM_PLAN_ID")"
    paypal_legacy_plan="$(env_value "$ENV_FILE" "PAYPAL_PLAN_ID")"

    [[ -n "$paypal_standard_plan" ]] || fatal "Missing PAYPAL_STANDARD_PLAN_ID in backend/.env"
    if [[ -z "$paypal_premium_plan" && -z "$paypal_legacy_plan" ]]; then
        fatal "Missing PAYPAL_PREMIUM_PLAN_ID (or legacy PAYPAL_PLAN_ID) in backend/.env"
    fi
    if [[ -z "$paypal_premium_plan" && -n "$paypal_legacy_plan" ]]; then
        warn "Using legacy PAYPAL_PLAN_ID fallback for premium plan. Prefer PAYPAL_PREMIUM_PLAN_ID."
    fi

    log "PayPal env validation passed (mode=$paypal_mode)."
}

validate_paymongo_env() {
    local paymongo_mode
    local standard_plan
    local premium_plan
    local generic_public
    local generic_secret
    local mode_public
    local mode_secret
    local resolved_public
    local resolved_secret
    local generic_webhook_secret
    local mode_webhook_secret
    local webhook_secret

    paymongo_mode="$(env_value "$ENV_FILE" "PAYMONGO_MODE")"
    paymongo_mode="${paymongo_mode:-test}"
    if [[ "$paymongo_mode" != "test" && "$paymongo_mode" != "live" ]]; then
        fatal "PAYMONGO_MODE must be either 'test' or 'live'. Current value: ${paymongo_mode:-<empty>}"
    fi
    if [[ "${DEPLOY_REQUIRE_LIVE_PAYMONGO:-0}" == "1" && "$paymongo_mode" != "live" ]]; then
        fatal "DEPLOY_REQUIRE_LIVE_PAYMONGO=1 but PAYMONGO_MODE is '$paymongo_mode'. Refusing production deploy."
    fi

    standard_plan="$(env_value "$ENV_FILE" "PAYMONGO_STANDARD_PLAN_ID")"
    premium_plan="$(env_value "$ENV_FILE" "PAYMONGO_PREMIUM_PLAN_ID")"
    [[ -n "$standard_plan" ]] || fatal "Missing PAYMONGO_STANDARD_PLAN_ID in backend/.env"
    [[ -n "$premium_plan" ]] || fatal "Missing PAYMONGO_PREMIUM_PLAN_ID in backend/.env"

    generic_public="$(env_value "$ENV_FILE" "PAYMONGO_PUBLIC_KEY")"
    generic_secret="$(env_value "$ENV_FILE" "PAYMONGO_SECRET_KEY")"
    if [[ "$paymongo_mode" == "live" ]]; then
        mode_public="$(env_value "$ENV_FILE" "PAYMONGO_LIVE_PUBLIC_KEY")"
        mode_secret="$(env_value "$ENV_FILE" "PAYMONGO_LIVE_SECRET_KEY")"
    else
        mode_public="$(env_value "$ENV_FILE" "PAYMONGO_TEST_PUBLIC_KEY")"
        mode_secret="$(env_value "$ENV_FILE" "PAYMONGO_TEST_SECRET_KEY")"
    fi
    resolved_public="${mode_public:-$generic_public}"
    resolved_secret="${mode_secret:-$generic_secret}"

    [[ -n "$resolved_public" ]] || fatal "Missing PayMongo public key for mode '$paymongo_mode' (set mode-specific key or PAYMONGO_PUBLIC_KEY)."
    [[ -n "$resolved_secret" ]] || fatal "Missing PayMongo secret key for mode '$paymongo_mode' (set mode-specific key or PAYMONGO_SECRET_KEY)."

    generic_webhook_secret="$(env_value "$ENV_FILE" "PAYMONGO_WEBHOOK_SECRET")"
    if [[ "$paymongo_mode" == "live" ]]; then
        mode_webhook_secret="$(env_value "$ENV_FILE" "PAYMONGO_LIVE_WEBHOOK_SECRET")"
    else
        mode_webhook_secret="$(env_value "$ENV_FILE" "PAYMONGO_TEST_WEBHOOK_SECRET")"
    fi
    webhook_secret="${mode_webhook_secret:-$generic_webhook_secret}"
    if [[ "${DEPLOY_REQUIRE_PAYMENT_WEBHOOK_SECRET:-1}" == "1" && -z "$webhook_secret" ]]; then
        fatal "PayMongo webhook secret is required for secure webhook verification in production deploys (set mode-specific secret or PAYMONGO_WEBHOOK_SECRET)."
    fi
    if [[ -z "$webhook_secret" ]]; then
        warn "PayMongo webhook secret is not set. Runtime PayMongo webhook verification rejects unsigned requests unless an explicit non-production bypass is configured."
    fi

    log "PayMongo env validation passed (mode=$paymongo_mode)."
}

PAYMENTS_ENABLED_RAW="$(env_value "$ENV_FILE" "PAYMENTS_ENABLED")"
PAYMENTS_ENABLED_NORMALIZED="$(echo "${PAYMENTS_ENABLED_RAW:-false}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
DEPLOY_RUN_BILLING_VERIFY_RAW="${DEPLOY_RUN_BILLING_VERIFY:-auto}"
DEPLOY_RUN_BILLING_VERIFY_MODE="$(echo "$DEPLOY_RUN_BILLING_VERIFY_RAW" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

if [[ "$PAYMENTS_ENABLED_NORMALIZED" == "true" ]]; then
    PAYMENT_PROVIDER_MODE_RAW="${DEPLOY_PAYMENT_PROVIDER:-auto}"
    PAYMENT_PROVIDER_MODE="$(echo "$PAYMENT_PROVIDER_MODE_RAW" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

    HAS_PAYMONGO_CONFIG="0"
    HAS_PAYPAL_CONFIG="0"
    [[ -n "$(env_value "$ENV_FILE" "PAYMONGO_STANDARD_PLAN_ID")" || -n "$(env_value "$ENV_FILE" "PAYMONGO_SECRET_KEY")" || -n "$(env_value "$ENV_FILE" "PAYMONGO_TEST_SECRET_KEY")" || -n "$(env_value "$ENV_FILE" "PAYMONGO_LIVE_SECRET_KEY")" ]] && HAS_PAYMONGO_CONFIG="1"
    [[ -n "$(env_value "$ENV_FILE" "PAYPAL_CLIENT_ID")" || -n "$(env_value "$ENV_FILE" "PAYPAL_STANDARD_PLAN_ID")" || -n "$(env_value "$ENV_FILE" "PAYPAL_CLIENT_SECRET")" ]] && HAS_PAYPAL_CONFIG="1"

    case "$PAYMENT_PROVIDER_MODE" in
        auto)
            if [[ "$HAS_PAYMONGO_CONFIG" == "1" ]]; then
                validate_paymongo_env
                if [[ "$HAS_PAYPAL_CONFIG" == "1" ]]; then
                    warn "PayPal env detected but deploy provider mode auto-selected PayMongo (preferred)."
                fi
            elif [[ "$HAS_PAYPAL_CONFIG" == "1" ]]; then
                warn "Auto mode fell back to PayPal because no PayMongo config was detected."
                validate_paypal_env
            else
                fatal "No payment provider configuration detected. Set PayMongo or PayPal env vars, or DEPLOY_PAYMENT_PROVIDER."
            fi
            ;;
        paymongo)
            validate_paymongo_env
            ;;
        paypal)
            validate_paypal_env
            ;;
        dual)
            validate_paymongo_env
            validate_paypal_env
            ;;
        *)
            fatal "Invalid DEPLOY_PAYMENT_PROVIDER='$PAYMENT_PROVIDER_MODE_RAW'. Use: auto | paymongo | paypal | dual"
            ;;
    esac
else
    log "PAYMENTS_ENABLED is not true in backend/.env; skipping payment provider validation."
fi

case "$DEPLOY_RUN_BILLING_VERIFY_MODE" in
    auto|0|1)
        ;;
    *)
        fatal "Invalid DEPLOY_RUN_BILLING_VERIFY='$DEPLOY_RUN_BILLING_VERIFY_RAW'. Use: auto | 0 | 1"
        ;;
esac

if [[ "$FRONTEND_ASSET_PARITY_STRICT" != "0" && "$FRONTEND_ASSET_PARITY_STRICT" != "1" ]]; then
    warn "Invalid DEPLOY_FRONTEND_ASSET_PARITY_STRICT='$FRONTEND_ASSET_PARITY_STRICT'. Falling back to 1."
    FRONTEND_ASSET_PARITY_STRICT="1"
fi

BILLING_CHECKS_ENABLED="0"
if [[ "$DEPLOY_RUN_BILLING_VERIFY_MODE" == "1" ]]; then
    BILLING_CHECKS_ENABLED="1"
    warn "Billing verification override enabled (DEPLOY_RUN_BILLING_VERIFY=1)."
elif [[ "$DEPLOY_RUN_BILLING_VERIFY_MODE" == "0" ]]; then
    BILLING_CHECKS_ENABLED="0"
    log "Billing verification disabled by override (DEPLOY_RUN_BILLING_VERIFY=0)."
elif [[ "$PAYMENTS_ENABLED_NORMALIZED" == "true" ]]; then
    BILLING_CHECKS_ENABLED="1"
else
    BILLING_CHECKS_ENABLED="0"
    log "Billing verification skipped by policy because PAYMENTS_ENABLED is not true."
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

if [[ "$AUTO_MODE" != "1" && -n "$EXPECTED_COMMIT" && "$REMOTE_COMMIT" != "$EXPECTED_COMMIT" ]]; then
    fatal "Expected commit mismatch. expected=$EXPECTED_COMMIT remote=$REMOTE_COMMIT. Refusing deploy."
fi
if [[ "$AUTO_MODE" != "1" && -z "$EXPECTED_COMMIT" ]]; then
    warn "No --expect-commit provided. Deploy will proceed against current remote HEAD."
fi

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
    FRONTEND_CHANGED_FILES="$(awk '{print $NF}' "$MANIFEST_FILE" | grep -E '^apps/dgfy-web/' | wc -l | tr -d '[:space:]')"
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

run_step "Building frontend production artifacts (IMS, POS, Store)..." run_frontend_builds
run_step "Recording frontend build manifest..." node "$PROJECT_ROOT/scripts/record-frontend-build-manifest.js" \
    --project-root "$PROJECT_ROOT" \
    --target-sha "$POST_PULL_COMMIT" \
    --output "$FRONTEND_BUILD_MANIFEST_FILE"

# ===========================================================================
# Database migrations
# ===========================================================================
run_step "Running database migration status (pre-check)..." bash -lc "cd \"$BACKEND_DIR\" && npx sequelize-cli db:migrate:status || true"
run_step "Running database migrations..." bash -lc "cd \"$BACKEND_DIR\" && npx sequelize-cli db:migrate"
run_step "Running database migration status (post-check)..." bash -lc "cd \"$BACKEND_DIR\" && npx sequelize-cli db:migrate:status || true"
run_step "Normalizing original legacy tenant account..." bash -lc "cd \"$BACKEND_DIR\" && node scripts/register_original_tenant.js --apply"
if [[ "$STRICT_LEGACY_AUDIT" == "1" ]]; then
    run_step "Auditing original legacy tenant invariants (strict)..." bash -lc "cd \"$BACKEND_DIR\" && node scripts/audit_original_legacy_account.js --strict"
else
    warn "Running legacy tenant audit in report mode (set DEPLOY_STRICT_LEGACY_AUDIT=1 to fail on detected risks)."
    run_step "Auditing original legacy tenant invariants..." bash -lc "cd \"$BACKEND_DIR\" && node scripts/audit_original_legacy_account.js"
fi

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

if [[ "$BILLING_CHECKS_ENABLED" == "1" ]]; then
    run_step "Running billing-funnel telemetry audit..." bash -lc "cd \"$BACKEND_DIR\" && npm run audit:billing-funnel"
else
    log "Skipping billing-funnel telemetry audit (billing checks disabled)."
fi

# ===========================================================================
# Tenant schema sync
# ===========================================================================
log "Running tenant schema sync..."
TENANT_SYNC_REPORT_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.tenant_schema_sync.json"
TENANT_SYNC_BASELINE_FILE="$BACKEND_DIR/config/deploy/tenant-schema-sync-failure-baseline.json"
TENANT_SYNC_MODE="${DEPLOY_TENANT_SCHEMA_SYNC_MODE:-report}"
TENANT_SYNC_REQUIRE_ZERO="${DEPLOY_TENANT_SYNC_REQUIRE_ZERO:-1}"
TENANT_INDEX_HEADROOM_REPORT_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.tenant_index_headroom.json"
TENANT_INDEX_HEADROOM_STRICT="${DEPLOY_TENANT_INDEX_HEADROOM_STRICT:-1}"
if [[ -f "$BACKEND_DIR/scripts/sync-tenant-schemas.js" ]]; then
    (cd "$BACKEND_DIR" && node scripts/sync-tenant-schemas.js --mode "$TENANT_SYNC_MODE" --report-file "$TENANT_SYNC_REPORT_FILE")
    if [[ -f "$TENANT_SYNC_BASELINE_FILE" ]]; then
        tenant_sync_gate_cmd="cd \"$BACKEND_DIR\" && node scripts/check-tenant-schema-sync-regressions.js --report-file \"$TENANT_SYNC_REPORT_FILE\" --baseline-file \"$TENANT_SYNC_BASELINE_FILE\""
        if [[ "$TENANT_SYNC_REQUIRE_ZERO" == "1" ]]; then
            tenant_sync_gate_cmd="$tenant_sync_gate_cmd --require-zero"
        fi
        run_step "Running tenant schema sync regression gate..." bash -lc "$tenant_sync_gate_cmd"
    else
        warn "Tenant schema sync baseline not found: $TENANT_SYNC_BASELINE_FILE (regression gate skipped)."
    fi
else
    warn "sync-tenant-schemas.js not found; skipped."
fi
if [[ -f "$BACKEND_DIR/scripts/audit-tenant-index-headroom.js" ]]; then
    tenant_index_headroom_cmd="cd \"$BACKEND_DIR\" && node scripts/audit-tenant-index-headroom.js --report-file \"$TENANT_INDEX_HEADROOM_REPORT_FILE\""
    if [[ "$TENANT_INDEX_HEADROOM_STRICT" == "1" ]]; then
        tenant_index_headroom_cmd="$tenant_index_headroom_cmd --strict"
    fi
    run_step "Running tenant index headroom audit..." bash -lc "$tenant_index_headroom_cmd"
else
    warn "audit-tenant-index-headroom.js not found; skipped."
fi
run_step "Backfilling legacy role permissions across tenant databases..." bash -lc "cd \"$BACKEND_DIR\" && node scripts/backfill-role-permissions.js"

# ===========================================================================
# Storefront discovery index reconciliation
# ===========================================================================
DEPLOY_RECONCILE_STOREFRONT_DISCOVERY_INDEX="${DEPLOY_RECONCILE_STOREFRONT_DISCOVERY_INDEX:-1}"
if [[ "$DEPLOY_RECONCILE_STOREFRONT_DISCOVERY_INDEX" == "1" ]]; then
    run_step "Reconciling storefront discovery index..." bash -lc "cd \"$BACKEND_DIR\" && npm run reconcile:storefront-discovery -- --json"
else
    warn "Storefront discovery index reconciliation skipped by DEPLOY_RECONCILE_STOREFRONT_DISCOVERY_INDEX=$DEPLOY_RECONCILE_STOREFRONT_DISCOVERY_INDEX."
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
mapfile -t BACKEND_HEALTH_CANDIDATES < <(build_backend_health_candidates "$BACKEND_PORT")

IMS_HEALTH_URL=""
POS_HEALTH_URL=""
STORE_HEALTH_URL=""
IMS_PUBLIC_VERIFIED_URL=""
POS_PUBLIC_VERIFIED_URL=""
STOREFRONT_PUBLIC_VERIFIED_URL=""
TENANT_STORE_PUBLIC_VERIFIED_URL=""
FRONTEND_ASSET_PARITY_STATUS="not_checked"

IMS_HEALTH_OVERRIDE="${DEPLOY_IMS_HEALTH_URL:-${DEPLOY_FRONTEND_HEALTH_URL:-}}"
POS_HEALTH_OVERRIDE="${DEPLOY_POS_HEALTH_URL:-}"
STORE_HEALTH_OVERRIDE="${DEPLOY_STORE_HEALTH_URL:-}"

IMS_PUBLIC_URL="${DEPLOY_IMS_URL:-https://skupervisor.dgfy.ph}"
POS_PUBLIC_URL="${DEPLOY_POS_URL:-https://pos.dgfy.ph}"
STOREFRONT_PUBLIC_URL="${DEPLOY_STOREFRONT_URL:-https://dgfy.ph}"
TENANT_STORE_PUBLIC_URL="${DEPLOY_TENANT_STORE_URL:-https://dgfy.ph${STORE_BASE_PATH%/}}"

mapfile -t IMS_HEALTH_CANDIDATES < <(build_surface_health_candidates "$IMS_HEALTH_OVERRIDE" "http://127.0.0.1:5173/")
mapfile -t POS_HEALTH_CANDIDATES < <(build_surface_health_candidates "$POS_HEALTH_OVERRIDE" "http://127.0.0.1:5174/")
mapfile -t STORE_HEALTH_CANDIDATES < <(build_surface_health_candidates "$STORE_HEALTH_OVERRIDE" "http://127.0.0.1:5175${STORE_BASE_PATH}" "http://127.0.0.1:5175/")

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

probe_url_candidates "IMS runtime" IMS_HEALTH_URL 12 2 "${IMS_HEALTH_CANDIDATES[@]}" || fatal "IMS runtime health check failed."
probe_url_candidates "POS runtime" POS_HEALTH_URL 12 2 "${POS_HEALTH_CANDIDATES[@]}" || fatal "POS runtime health check failed."
probe_url_candidates "Store runtime" STORE_HEALTH_URL 12 2 "${STORE_HEALTH_CANDIDATES[@]}" || fatal "Store runtime health check failed."

if [[ "$VERIFY_PUBLIC_ENDPOINTS" == "1" ]]; then
    mapfile -t IMS_PUBLIC_CANDIDATES < <(build_surface_health_candidates "$IMS_PUBLIC_URL")
    mapfile -t POS_PUBLIC_CANDIDATES < <(build_surface_health_candidates "$POS_PUBLIC_URL")
    mapfile -t STOREFRONT_PUBLIC_CANDIDATES < <(build_surface_health_candidates "$STOREFRONT_PUBLIC_URL")
    mapfile -t TENANT_STORE_PUBLIC_CANDIDATES < <(build_surface_health_candidates "$TENANT_STORE_PUBLIC_URL" "${TENANT_STORE_PUBLIC_URL%/}/")

    probe_url_candidates "Public endpoint IMS" IMS_PUBLIC_VERIFIED_URL 8 3 "${IMS_PUBLIC_CANDIDATES[@]}" || fatal "Public endpoint check failed for IMS ($IMS_PUBLIC_URL)."
    probe_url_candidates "Public endpoint POS" POS_PUBLIC_VERIFIED_URL 8 3 "${POS_PUBLIC_CANDIDATES[@]}" || fatal "Public endpoint check failed for POS ($POS_PUBLIC_URL)."
    probe_url_candidates "Public endpoint Storefront" STOREFRONT_PUBLIC_VERIFIED_URL 8 3 "${STOREFRONT_PUBLIC_CANDIDATES[@]}" || fatal "Public endpoint check failed for Storefront ($STOREFRONT_PUBLIC_URL)."
    probe_url_candidates "Public endpoint Tenant Store" TENANT_STORE_PUBLIC_VERIFIED_URL 8 3 "${TENANT_STORE_PUBLIC_CANDIDATES[@]}" || fatal "Public endpoint check failed for Tenant Store ($TENANT_STORE_PUBLIC_URL)."
    verify_tenant_store_asset_integrity "$TENANT_STORE_PUBLIC_VERIFIED_URL" || fatal "Tenant Store asset-integrity validation failed."

    if run_frontend_asset_parity_checks "$IMS_PUBLIC_VERIFIED_URL" "$POS_PUBLIC_VERIFIED_URL" "$TENANT_STORE_PUBLIC_VERIFIED_URL"; then
        FRONTEND_ASSET_PARITY_STATUS="pass"
    else
        if [[ "$FRONTEND_ASSET_PARITY_STRICT" == "1" ]]; then
            fatal "Frontend asset parity checks failed (DEPLOY_FRONTEND_ASSET_PARITY_STRICT=1)."
        fi
        FRONTEND_ASSET_PARITY_STATUS="warn"
        warn "Frontend asset parity checks failed, but deploy continues because DEPLOY_FRONTEND_ASSET_PARITY_STRICT=0."
    fi
else
    warn "Public endpoint checks disabled (DEPLOY_VERIFY_PUBLIC_ENDPOINTS=$VERIFY_PUBLIC_ENDPOINTS)."
    FRONTEND_ASSET_PARITY_STATUS="skipped"
fi

if [[ "$BILLING_CHECKS_ENABLED" == "1" ]]; then
    run_optional_node_script "$BACKEND_DIR" "scripts/verify_production_billing.js" "production billing verification"
else
    log "Skipping production billing verification hook (billing checks disabled)."
fi

# ===========================================================================
# Deep AI Verification (Optional Gate)
# ===========================================================================
if [[ "$DEEP_VERIFY" == "1" ]]; then
    VERIFY_TENANT_NAME="${DEPLOY_VERIFY_TENANT_NAME:-Premium Corp}"
    VERIFY_TENANT_TOKEN="${DEPLOY_VERIFY_TENANT_TOKEN:-}"
    VERIFY_SKIP_IF_MISSING="${DEPLOY_VERIFY_SKIP_IF_MISSING:-1}"

    verify_cmd="cd \"$BACKEND_DIR\" && VERIFY_SKIP_IF_MISSING=\"$VERIFY_SKIP_IF_MISSING\" node scripts/qa_30_questions_verification.js --tenant-name \"$VERIFY_TENANT_NAME\""
    if [[ -n "$VERIFY_TENANT_TOKEN" ]]; then
        verify_cmd="$verify_cmd --tenant-token \"$VERIFY_TENANT_TOKEN\""
    fi
    run_step "Running Deep AI Verification (30-Questions Gate)..." bash -lc "$verify_cmd"
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
PRODUCTION_DEPLOY_CONTRACT_FILE="$DEPLOY_LOG_DIR/deploy_${RUN_TS}.production_contract.json"

{
    echo "deploy_timestamp=$RUN_TS"
    echo "target_branch=$TARGET_BRANCH"
    echo "previous_head=$PRE_DEPLOY_COMMIT"
    echo "deployed_head=$POST_PULL_COMMIT"
    echo "remote_head=$REMOTE_COMMIT"
    echo "expected_commit=${EXPECTED_COMMIT:-none}"
    echo "manifest_file=$MANIFEST_FILE"
    echo "frontend_build_manifest_file=$FRONTEND_BUILD_MANIFEST_FILE"
    echo "log_file=$LOG_FILE"
    echo "migrations_changed=$MIGRATIONS_CHANGED"
    echo "db_backup_file=${BACKUP_FILE:-none}"
    echo "payments_enabled=$PAYMENTS_ENABLED_NORMALIZED"
    echo "deploy_run_billing_verify_mode=$DEPLOY_RUN_BILLING_VERIFY_MODE"
    echo "billing_checks_enabled=$BILLING_CHECKS_ENABLED"
    echo "total_changed_files=$TOTAL_CHANGED_FILES"
    echo "backend_changed_files=$BACKEND_CHANGED_FILES"
    echo "frontend_changed_files=$FRONTEND_CHANGED_FILES"
    echo "docs_changed_files=$DOCS_CHANGED_FILES"
    echo "scripts_changed_files=$SCRIPTS_CHANGED_FILES"
    echo "backend_health_url=$BACKEND_HEALTH_URL"
    echo "ims_health_url=$IMS_HEALTH_URL"
    echo "pos_health_url=$POS_HEALTH_URL"
    echo "store_health_url=$STORE_HEALTH_URL"
    echo "ims_public_url=${IMS_PUBLIC_VERIFIED_URL:-not_checked}"
    echo "pos_public_url=${POS_PUBLIC_VERIFIED_URL:-not_checked}"
    echo "storefront_public_url=${STOREFRONT_PUBLIC_VERIFIED_URL:-not_checked}"
    echo "tenant_store_public_url=${TENANT_STORE_PUBLIC_VERIFIED_URL:-not_checked}"
    echo "frontend_asset_parity_status=${FRONTEND_ASSET_PARITY_STATUS:-not_checked}"
    echo "tenant_schema_sync_report_file=${TENANT_SYNC_REPORT_FILE:-none}"
    echo "tenant_schema_sync_baseline_file=${TENANT_SYNC_BASELINE_FILE:-none}"
    echo "tenant_schema_sync_mode=${TENANT_SYNC_MODE:-report}"
    echo "tenant_schema_sync_require_zero=${TENANT_SYNC_REQUIRE_ZERO:-0}"
    echo "tenant_index_headroom_report_file=${TENANT_INDEX_HEADROOM_REPORT_FILE:-none}"
    echo "tenant_index_headroom_strict=${TENANT_INDEX_HEADROOM_STRICT:-0}"
    echo "production_deploy_contract_file=$PRODUCTION_DEPLOY_CONTRACT_FILE"
    echo "elapsed_seconds=$ELAPSED"
} > "$SUMMARY_FILE"

run_step "Verifying production deployment source contract..." node "$PROJECT_ROOT/scripts/verify-production-deploy-contract.js" \
    --project-root "$PROJECT_ROOT" \
    --target-sha "$POST_PULL_COMMIT" \
    --deploy-state-file "$DEPLOY_STATE_DIR/last_deployed_commit" \
    --deploy-summary-file "$SUMMARY_FILE" \
    --health-url "$BACKEND_HEALTH_URL" \
    --report "$PRODUCTION_DEPLOY_CONTRACT_FILE"

log "Deployment summary: $SUMMARY_FILE"
log "Production deployment contract: $PRODUCTION_DEPLOY_CONTRACT_FILE"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           DEPLOYMENT COMPLETED SUCCESSFULLY              ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Commit  : ${GREEN}${POST_PULL_COMMIT:0:10}${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Duration: ${YELLOW}${ELAPSED_MIN}m ${ELAPSED_SEC}s${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Health  : ${GREEN}OK Backend${NC}  ${GREEN}OK IMS${NC}  ${GREEN}OK POS${NC}  ${GREEN}OK Store${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
