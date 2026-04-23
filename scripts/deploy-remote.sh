#!/usr/bin/env bash
set -euo pipefail

# ==========================================
# Remote Deployment Trigger
# ==========================================
# Runs LOCALLY on your development machine.
# Pushes local changes to GitHub, then SSHes into the production
# server and runs deploy.sh in one command.
#
# Usage: bash scripts/deploy-remote.sh [--skip-db-backup] [--yes]

# ------------------------------------------
# Configuration
# ------------------------------------------
REMOTE_HOST="192.53.116.33"
REMOTE_PORT="64428"
REMOTE_USER="root"
REMOTE_DIR="/var/www/skupervisor"
DEPLOY_SCRIPT="scripts/deploy.sh"
TARGET_BRANCH="master"

# ------------------------------------------
# Deployment policy flags (non-secret)
# Forwarded to remote deploy.sh
# ------------------------------------------
DEPLOY_PAYMENT_PROVIDER="${DEPLOY_PAYMENT_PROVIDER:-auto}"
DEPLOY_REQUIRE_LIVE_PAYPAL="${DEPLOY_REQUIRE_LIVE_PAYPAL:-0}"
DEPLOY_REQUIRE_LIVE_PAYMONGO="${DEPLOY_REQUIRE_LIVE_PAYMONGO:-0}"
DEPLOY_VERIFY_PUBLIC_ENDPOINTS="${DEPLOY_VERIFY_PUBLIC_ENDPOINTS:-1}"
DEPLOY_STRICT_LEGACY_AUDIT="${DEPLOY_STRICT_LEGACY_AUDIT:-0}"
DEPLOY_STORE_BASE_PATH="${DEPLOY_STORE_BASE_PATH:-/tenant-store/}"
DEPLOY_IMS_URL="${DEPLOY_IMS_URL:-https://skupervisor.surebizcorp.com}"
DEPLOY_POS_URL="${DEPLOY_POS_URL:-https://pos.surebizcorp.com}"
DEPLOY_STOREFRONT_URL="${DEPLOY_STOREFRONT_URL:-https://surebizcorp.com}"
DEPLOY_TENANT_STORE_URL="${DEPLOY_TENANT_STORE_URL:-https://surebizcorp.com${DEPLOY_STORE_BASE_PATH%/}}"
DEPLOY_IMS_HEALTH_URL="${DEPLOY_IMS_HEALTH_URL:-${DEPLOY_FRONTEND_HEALTH_URL:-}}"
DEPLOY_POS_HEALTH_URL="${DEPLOY_POS_HEALTH_URL:-}"
DEPLOY_STORE_HEALTH_URL="${DEPLOY_STORE_HEALTH_URL:-}"
DEPLOY_BACKEND_HEALTH_URL="${DEPLOY_BACKEND_HEALTH_URL:-}"
DEPLOY_ENFORCE_NO_STAGING_GATE="${DEPLOY_ENFORCE_NO_STAGING_GATE:-1}"

# ------------------------------------------
# Optional flags parsed from CLI
# ------------------------------------------
SKIP_DB_BACKUP="0"
AUTO_CONFIRM="0"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-db-backup)
            SKIP_DB_BACKUP="1"
            shift
            ;;
        --yes)
            AUTO_CONFIRM="1"
            shift
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: bash scripts/deploy-remote.sh [--skip-db-backup] [--yes]"
            exit 1
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
NC='\033[0m'

echo -e "\n${CYAN}Remote Deployment Trigger${NC}"
echo -e "   Target: ${YELLOW}$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR${NC}"
echo -e "   Branch: ${YELLOW}$TARGET_BRANCH${NC}\n"

if hostname -I 2>/dev/null | tr ' ' '\n' | grep -Fxq "$REMOTE_HOST"; then
    echo -e "${YELLOW}Detected execution on target server ($REMOTE_HOST).${NC}"
    echo -e "${YELLOW}Running local deploy script directly (no SSH hop).${NC}"
    export DEPLOY_PAYMENT_PROVIDER="$DEPLOY_PAYMENT_PROVIDER"
    export DEPLOY_REQUIRE_LIVE_PAYPAL="$DEPLOY_REQUIRE_LIVE_PAYPAL"
    export DEPLOY_REQUIRE_LIVE_PAYMONGO="$DEPLOY_REQUIRE_LIVE_PAYMONGO"
    export DEPLOY_VERIFY_PUBLIC_ENDPOINTS="$DEPLOY_VERIFY_PUBLIC_ENDPOINTS"
    export DEPLOY_STRICT_LEGACY_AUDIT="$DEPLOY_STRICT_LEGACY_AUDIT"
    export DEPLOY_STORE_BASE_PATH="$DEPLOY_STORE_BASE_PATH"
    export DEPLOY_IMS_URL="$DEPLOY_IMS_URL"
    export DEPLOY_POS_URL="$DEPLOY_POS_URL"
    export DEPLOY_STOREFRONT_URL="$DEPLOY_STOREFRONT_URL"
    export DEPLOY_TENANT_STORE_URL="$DEPLOY_TENANT_STORE_URL"
    if [ -n "$DEPLOY_IMS_HEALTH_URL" ]; then
        export DEPLOY_IMS_HEALTH_URL="$DEPLOY_IMS_HEALTH_URL"
    fi
    if [ -n "$DEPLOY_POS_HEALTH_URL" ]; then
        export DEPLOY_POS_HEALTH_URL="$DEPLOY_POS_HEALTH_URL"
    fi
    if [ -n "$DEPLOY_STORE_HEALTH_URL" ]; then
        export DEPLOY_STORE_HEALTH_URL="$DEPLOY_STORE_HEALTH_URL"
    fi
    [ -n "$DEPLOY_BACKEND_HEALTH_URL" ] && export DEPLOY_BACKEND_HEALTH_URL="$DEPLOY_BACKEND_HEALTH_URL"
    deploy_extra_args=""
    if [ "$SKIP_DB_BACKUP" = "1" ]; then
        deploy_extra_args="--skip-db-backup"
    fi
    bash "$DEPLOY_SCRIPT" --branch "$TARGET_BRANCH" $deploy_extra_args
    exit $?
fi

# ------------------------------------------
# Step 1: Confirm intent
# ------------------------------------------
if [[ "$AUTO_CONFIRM" != "1" ]]; then
    read -p "Deploy to PRODUCTION? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}--yes supplied: skipping confirmation prompt.${NC}"
fi

# ------------------------------------------
# Step 2: Check local changes
# ------------------------------------------
echo -e "\n${YELLOW}Checking local git status...${NC}"

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${YELLOW}You have uncommitted local changes:${NC}"
    git status --short
    echo ""
    if [[ "$AUTO_CONFIRM" == "1" ]]; then
        echo -e "${YELLOW}--yes supplied: skipping auto-commit and proceeding with existing committed HEAD only.${NC}"
    else
        read -p "Commit them now before deploying? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "Commit message: " COMMIT_MSG
            if [ -z "${COMMIT_MSG:-}" ]; then
                COMMIT_MSG="chore: pre-deploy changes"
            fi
            git add -A
            git commit -m "$COMMIT_MSG"
            echo -e "${GREEN}Changes committed.${NC}"
        else
            echo -e "${YELLOW}Proceeding without committing local changes (they won't be deployed).${NC}"
        fi
    fi
fi

# ------------------------------------------
# Step 3: Sync with remote before pushing
# ------------------------------------------
echo -e "\n${YELLOW}Fetching remote changes...${NC}"
git fetch origin "$TARGET_BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$TARGET_BRANCH")"
BASE="$(git merge-base HEAD "origin/$TARGET_BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}Already up to date with remote.${NC}"
elif [ "$LOCAL" = "$BASE" ]; then
    echo -e "${YELLOW}Remote is ahead. Pulling first...${NC}"
    git pull --rebase origin "$TARGET_BRANCH"
    echo -e "${GREEN}Pull successful.${NC}"
elif [ "$REMOTE" = "$BASE" ]; then
    echo -e "${GREEN}Local is ahead of remote; ready to push.${NC}"
else
    echo -e "${YELLOW}Local and remote diverged. Rebasing...${NC}"
    git pull --rebase origin "$TARGET_BRANCH"
    echo -e "${GREEN}Rebase successful.${NC}"
fi

# ------------------------------------------
# Step 3.5: No-staging gate preflight (before push)
# ------------------------------------------
LOCAL_COMMIT="$(git rev-parse HEAD)"
if [[ "$DEPLOY_ENFORCE_NO_STAGING_GATE" == "1" ]]; then
    echo -e "\n${YELLOW}Running no-staging release preflight for commit ${LOCAL_COMMIT}...${NC}"
    RELEASE_TARGET_SHA="$LOCAL_COMMIT" DEPLOY_ENFORCE_NO_STAGING_GATE=1 npm run gate:release:no-staging:preflight
    echo -e "${GREEN}No-staging preflight passed.${NC}"
fi

# ------------------------------------------
# Step 4: Push to GitHub
# ------------------------------------------
echo -e "\n${YELLOW}Pushing to GitHub ($TARGET_BRANCH)...${NC}"
git push origin "$TARGET_BRANCH"
echo -e "${GREEN}Push successful.${NC}"

# ------------------------------------------
# Step 5: Enforce no-staging release hard gate
# ------------------------------------------
if [[ "$DEPLOY_ENFORCE_NO_STAGING_GATE" == "1" ]]; then
    QA_DEPLOY_SUMMARY_FILE_EFFECTIVE="${QA_DEPLOY_SUMMARY_FILE:-.tmp/release-gates/${LOCAL_COMMIT}/qa_deploy_summary.txt}"
    if [[ ! -f "$QA_DEPLOY_SUMMARY_FILE_EFFECTIVE" ]]; then
        echo -e "\n${YELLOW}QA deploy summary not found locally. Attempting fetch over SSH evidence path...${NC}"
        RELEASE_TARGET_SHA="$LOCAL_COMMIT" QA_DEPLOY_SUMMARY_FILE="$QA_DEPLOY_SUMMARY_FILE_EFFECTIVE" npm run evidence:qa:deploy-summary
        echo -e "${GREEN}Fetched QA deploy summary: ${QA_DEPLOY_SUMMARY_FILE_EFFECTIVE}${NC}"
    fi

    echo -e "\n${YELLOW}Running no-staging release gate for commit ${LOCAL_COMMIT}...${NC}"
    RELEASE_TARGET_SHA="$LOCAL_COMMIT" npm run gate:release:no-staging
    echo -e "${GREEN}No-staging release gate passed.${NC}"
else
    echo -e "${YELLOW}No-staging release gate skipped (DEPLOY_ENFORCE_NO_STAGING_GATE=$DEPLOY_ENFORCE_NO_STAGING_GATE).${NC}"
fi

# ------------------------------------------
# Step 6: Build remote deploy arguments
# ------------------------------------------
REMOTE_DEPLOY_ARGS="--branch ${TARGET_BRANCH} --expect-commit ${LOCAL_COMMIT}"
if [ "$SKIP_DB_BACKUP" = "1" ]; then
    REMOTE_DEPLOY_ARGS="$REMOTE_DEPLOY_ARGS --skip-db-backup"
fi

# Build environment exports for the remote side
REMOTE_EXPORTS="export DEPLOY_PAYMENT_PROVIDER='${DEPLOY_PAYMENT_PROVIDER}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_REQUIRE_LIVE_PAYPAL='${DEPLOY_REQUIRE_LIVE_PAYPAL}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_REQUIRE_LIVE_PAYMONGO='${DEPLOY_REQUIRE_LIVE_PAYMONGO}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_VERIFY_PUBLIC_ENDPOINTS='${DEPLOY_VERIFY_PUBLIC_ENDPOINTS}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_STRICT_LEGACY_AUDIT='${DEPLOY_STRICT_LEGACY_AUDIT}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_STORE_BASE_PATH='${DEPLOY_STORE_BASE_PATH}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_IMS_URL='${DEPLOY_IMS_URL}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_POS_URL='${DEPLOY_POS_URL}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_STOREFRONT_URL='${DEPLOY_STOREFRONT_URL}'"
REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_TENANT_STORE_URL='${DEPLOY_TENANT_STORE_URL}'"
[ -n "$DEPLOY_IMS_HEALTH_URL" ] && REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_IMS_HEALTH_URL='${DEPLOY_IMS_HEALTH_URL}'"
[ -n "$DEPLOY_POS_HEALTH_URL" ] && REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_POS_HEALTH_URL='${DEPLOY_POS_HEALTH_URL}'"
[ -n "$DEPLOY_STORE_HEALTH_URL" ] && REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_STORE_HEALTH_URL='${DEPLOY_STORE_HEALTH_URL}'"
[ -n "$DEPLOY_BACKEND_HEALTH_URL" ] && REMOTE_EXPORTS="${REMOTE_EXPORTS}; export DEPLOY_BACKEND_HEALTH_URL='${DEPLOY_BACKEND_HEALTH_URL}'"

# ------------------------------------------
# Step 7: SSH and run server deployment
# ------------------------------------------
echo -e "\n${YELLOW}Connecting to production server...${NC}"

ssh -t -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" "
    set -e

    echo ''
    echo '=================================================='
    echo '  Connected to: ${REMOTE_HOST}'
    echo '  Directory:    ${REMOTE_DIR}'
    echo '=================================================='

    cd ${REMOTE_DIR} || { echo 'Could not cd to ${REMOTE_DIR}'; exit 1; }

    chmod +x ${DEPLOY_SCRIPT}

    ${REMOTE_EXPORTS}

    ./${DEPLOY_SCRIPT} ${REMOTE_DEPLOY_ARGS}
"

SSH_EXIT=$?

echo ""
if [ $SSH_EXIT -eq 0 ]; then
    echo -e "${GREEN}Deployment finished successfully.${NC}"
    echo -e "   IMS:         ${CYAN}${DEPLOY_IMS_URL}${NC}"
    echo -e "   POS:         ${CYAN}${DEPLOY_POS_URL}${NC}"
    echo -e "   Storefront:  ${CYAN}${DEPLOY_STOREFRONT_URL}${NC}"
    echo -e "   TenantStore: ${CYAN}${DEPLOY_TENANT_STORE_URL}${NC}"
else
    echo -e "${RED}Deployment failed (SSH exited with code $SSH_EXIT).${NC}"
    echo -e "   Check server logs: ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST 'pm2 logs sku-backend --lines 50'"
    exit 1
fi
