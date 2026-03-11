#!/bin/bash
set -euo pipefail

# ==========================================
# Remote Deployment Trigger
# ==========================================
# Runs LOCALLY on your development machine.
# Pushes local changes to GitHub, then SSHes into the production
# server and runs deploy.sh in one command.
#
# Usage: bash scripts/deploy-remote.sh

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
DEPLOY_REQUIRE_LIVE_PAYPAL="${DEPLOY_REQUIRE_LIVE_PAYPAL:-1}"
DEPLOY_FRONTEND_HEALTH_URL="${DEPLOY_FRONTEND_HEALTH_URL:-}"
DEPLOY_BACKEND_HEALTH_URL="${DEPLOY_BACKEND_HEALTH_URL:-}"

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
    export DEPLOY_REQUIRE_LIVE_PAYPAL="$DEPLOY_REQUIRE_LIVE_PAYPAL"
    if [ -n "$DEPLOY_FRONTEND_HEALTH_URL" ]; then
        export DEPLOY_FRONTEND_HEALTH_URL="$DEPLOY_FRONTEND_HEALTH_URL"
    fi
    if [ -n "$DEPLOY_BACKEND_HEALTH_URL" ]; then
        export DEPLOY_BACKEND_HEALTH_URL="$DEPLOY_BACKEND_HEALTH_URL"
    fi
    bash "$DEPLOY_SCRIPT" --branch "$TARGET_BRANCH"
    exit $?
fi

# ------------------------------------------
# Step 1: Confirm intent
# ------------------------------------------
read -p "Deploy to PRODUCTION? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# ------------------------------------------
# Step 2: Check local changes
# ------------------------------------------
echo -e "\n${YELLOW}Checking local git status...${NC}"

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${YELLOW}You have uncommitted local changes:${NC}"
    git status --short
    echo ""
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
# Step 4: Push to GitHub
# ------------------------------------------
echo -e "\n${YELLOW}Pushing to GitHub ($TARGET_BRANCH)...${NC}"
git push origin "$TARGET_BRANCH"
echo -e "${GREEN}Push successful.${NC}"

LOCAL_COMMIT="$(git rev-parse HEAD)"

# ------------------------------------------
# Step 5: SSH and run server deployment
# ------------------------------------------
echo -e "\n${YELLOW}Connecting to production server...${NC}"

ssh -t -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" "
    set -e

    echo ''
    echo '=================================================='
    echo '  Connected to: $REMOTE_HOST'
    echo '  Directory:    $REMOTE_DIR'
    echo '=================================================='

    cd '$REMOTE_DIR' || { echo 'Could not cd to $REMOTE_DIR'; exit 1; }

    chmod +x '$DEPLOY_SCRIPT'

    export DEPLOY_REQUIRE_LIVE_PAYPAL='$DEPLOY_REQUIRE_LIVE_PAYPAL'
    export DEPLOY_FRONTEND_HEALTH_URL='$DEPLOY_FRONTEND_HEALTH_URL'
    if [ -n '$DEPLOY_BACKEND_HEALTH_URL' ]; then
      export DEPLOY_BACKEND_HEALTH_URL='$DEPLOY_BACKEND_HEALTH_URL'
    fi

    ./'$DEPLOY_SCRIPT' --branch '$TARGET_BRANCH' --expect-commit '$LOCAL_COMMIT'
"

SSH_EXIT=$?

echo ""
if [ $SSH_EXIT -eq 0 ]; then
    echo -e "${GREEN}Deployment finished successfully.${NC}"
    echo -e "   App: ${CYAN}https://skupervisor.surebizcorp.com${NC}"
else
    echo -e "${RED}Deployment failed (SSH exited with code $SSH_EXIT).${NC}"
    echo -e "   Check server logs: ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST 'pm2 logs sku-backend --lines 50'"
    exit 1
fi
