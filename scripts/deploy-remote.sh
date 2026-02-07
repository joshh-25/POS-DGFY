#!/bin/bash

# ==========================================
# Remote Deployment Trigger
# ==========================================
# This script runs LOCALLY on your development machine.
# It pushes changes to git and then triggers the deployment script
# on the remote production server via SSH.
#
# Usage: ./scripts/deploy-remote.sh

# Configuration
REMOTE_HOST="192.53.116.33"
REMOTE_PORT="64428"
REMOTE_USER="root"
REMOTE_DIR="/var/www/skupervisor"
DEPLOY_SCRIPT="scripts/deploy.sh"

echo -e "\n🚀 \033[1;36mRemote Deployment Trigger\033[0m"
echo "Target: $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"

# 1. Confirm with User
read -p "❓ Are you sure you want to deploy to PRODUCTION? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled."
    exit 1
fi

# 2. Push to Git
echo -e "\n📦 \033[1;33mPushing local changes to 'master'...\033[0m"
git push origin master
if [ $? -ne 0 ]; then
    echo "❌ Git push failed. Please fix conflicts or errors before deploying."
    exit 1
fi

# 3. Trigger Remote Deployment
echo -e "\n📡 \033[1;33mConnecting to server to start deployment...\033[0m"

ssh -t -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" "
    echo '>> Connected to remote server.'
    cd $REMOTE_DIR || exit 1
    
    # Ensure script is executable
    chmod +x $DEPLOY_SCRIPT
    
    # Run the script
    ./$DEPLOY_SCRIPT
"

echo -e "\n✨ \033[1;32mRemote deployment sequence finished.\033[0m"
