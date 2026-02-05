#!/bin/bash

# Production Deployment Script
# ----------------------------
# This script automates the deployment process on the production server.
# Usage: ./deploy.sh

# Exit immediately if a command exits with a non-zero status (Safety Switch)
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes
echo "📥 Pulling latest code..."
git pull origin master

# 2. Install Dependencies
echo "📦 Installing root dependencies..."
npm install

echo "📦 Installing backend dependencies..."
cd backend
NODE_ENV=production npm install
cd ..

echo "📦 Installing frontend dependencies..."
cd frontend
NODE_ENV=production npm install

# 3. Build Frontend
echo "🏗️  Building frontend..."
NODE_ENV=production npm run build
cd ..

# 4. Database Migrations
echo "🗄️  Running database migrations..."
cd backend
npx sequelize-cli db:migrate
# Check for secondary migrations folder if it exists (optional safety check could go here, but keeping it simple as per workflow)
if [ -d "migrations" ]; then
    echo "🗄️  Running secondary migrations..."
    npx sequelize-cli db:migrate --migrations-path migrations
fi
cd ..

# 5. Restart Services
echo "🔄 Restarting PM2 services..."
pm2 restart all

echo "✅ Deployment completed successfully!"
