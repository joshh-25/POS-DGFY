#!/bin/bash

# ==========================================
# Remote Deployment Trigger
# ==========================================
# Runs LOCALLY on your development machine.
# Pushes local changes to GitHub, then SSHs into the production
# server and runs deploy.sh — a single command for full deployment.
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

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
NC='\033[0m' # No Color

echo -e "\n🚀 ${CYAN}Remote Deployment Trigger${NC}"
echo -e "   Target: ${YELLOW}$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR${NC}"
echo -e "   Branch: ${YELLOW}master${NC}\n"

# ------------------------------------------
# Step 1: Confirm Intent
# ------------------------------------------
read -p "❓ Deploy to PRODUCTION? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Deployment cancelled.${NC}"
    exit 1
fi

# ------------------------------------------
# Step 2: Check for uncommitted local changes
# ------------------------------------------
echo -e "\n${YELLOW}📋 Checking local git status...${NC}"

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${YELLOW}⚠️  You have uncommitted local changes:${NC}"
    git status --short
    echo ""
    read -p "   Do you want to commit them now before deploying? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "   Commit message: " COMMIT_MSG
        if [ -z "$COMMIT_MSG" ]; then
            COMMIT_MSG="chore: pre-deploy changes"
        fi
        git add -A
        git commit -m "$COMMIT_MSG"
        echo -e "${GREEN}✅ Changes committed.${NC}"
    else
        echo -e "${YELLOW}⚠️  Proceeding without committing local changes (they won't be deployed).${NC}"
    fi
fi

# ------------------------------------------
# Step 3: Sync with remote before pushing
# ------------------------------------------
echo -e "\n${YELLOW}🔄 Fetching remote changes...${NC}"
git fetch origin master

# Check if remote is ahead of local (would cause push rejection)
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)
BASE=$(git merge-base HEAD origin/master)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}✅ Already up to date with remote.${NC}"
elif [ "$LOCAL" = "$BASE" ]; then
    # Remote is ahead — pull before pushing
    echo -e "${YELLOW}⚠️  Remote has commits your local branch doesn't have. Pulling first...${NC}"
    git pull --rebase origin master
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Pull/rebase failed — there are merge conflicts that need manual resolution.${NC}"
        echo -e "   Run: git status"
        exit 1
    fi
    echo -e "${GREEN}✅ Pull successful. Local is now up to date.${NC}"
elif [ "$REMOTE" = "$BASE" ]; then
    echo -e "${GREEN}✅ Local is ahead of remote — ready to push.${NC}"
else
    # Branches have diverged
    echo -e "${YELLOW}⚠️  Local and remote have diverged. Attempting rebase...${NC}"
    git pull --rebase origin master
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Rebase failed — there are merge conflicts that need manual resolution.${NC}"
        echo -e "   Run: git status  then resolve conflicts, then re-run this script."
        exit 1
    fi
    echo -e "${GREEN}✅ Rebase successful.${NC}"
fi

# ------------------------------------------
# Step 4: Push to GitHub
# ------------------------------------------
echo -e "\n${YELLOW}📦 Pushing to GitHub (master)...${NC}"
git push origin master
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Git push failed. Fix auth errors before deploying.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Push successful.${NC}"

# ------------------------------------------
# Step 5: SSH into server and run deploy.sh
# ------------------------------------------
echo -e "\n${YELLOW}📡 Connecting to production server...${NC}"

ssh -t -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" "
    set -e

    echo ''
    echo '=================================================='
    echo '  Connected to: $REMOTE_HOST'
    echo '  Directory:    $REMOTE_DIR'
    echo '=================================================='

    cd $REMOTE_DIR || { echo '❌ Could not cd to $REMOTE_DIR'; exit 1; }

    # Ensure the deploy script is executable (survives git clone permission loss)
    chmod +x $DEPLOY_SCRIPT

    # Run the full deployment
    ./$DEPLOY_SCRIPT
"

SSH_EXIT=$?

echo ""
if [ $SSH_EXIT -eq 0 ]; then
    echo -e "${GREEN}✨ Deployment finished successfully!${NC}"
    echo -e "   App: ${CYAN}https://skupervisor.surebizcorp.com${NC}"
else
    echo -e "${RED}❌ Deployment failed (SSH exited with code $SSH_EXIT).${NC}"
    echo -e "   Check server logs: ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST 'pm2 logs sku-backend --lines 50'"
    exit 1
fi
