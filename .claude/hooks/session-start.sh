#!/bin/bash
# .claude/hooks/session-start.sh
# Optimized session hook for SKU Inventory Manager (Monorepo)
# Detects project state and provides relevant context

set -euo pipefail

echo "🚀 SKU Inventory Manager - Session Start (Monorepo)"
echo "════════════════════════════════════════════════════"

# 1. Check if dependencies are installed
echo "📦 Dependencies:"
if [ ! -d "frontend/node_modules" ] && [ ! -d "backend/node_modules" ]; then
    echo "   ⚠️  No dependencies installed"
    echo "   Run: npm run install:all"
elif [ ! -d "frontend/node_modules" ]; then
    echo "   ⚠️  Frontend dependencies missing"
    echo "   Run: cd frontend && npm install"
elif [ ! -d "backend/node_modules" ]; then
    echo "   ⚠️  Backend dependencies missing"
    echo "   Run: cd backend && npm install"
else
    echo "   ✅ Frontend & Backend installed"
fi

# 2. Check if dev servers can start
if command -v npm &> /dev/null; then
    echo "   ✅ npm: Available"
else
    echo "   ❌ npm: Not found"
fi

# 3. Show git context
if command -v git &> /dev/null; then
    echo ""
    echo "📍 Git Context:"
    echo "   Branch: $(git branch --show-current 2>/dev/null || echo 'N/A')"
    echo "   Last commit: $(git log -1 --oneline 2>/dev/null || echo 'N/A')"
fi

# 4. Detect what you're working on
echo ""
echo "💡 Context Detection:"

# Check monorepo structure
if [ -d "frontend" ] && [ -d "backend" ]; then
    echo "   ✅ Monorepo structure detected"
fi

if [ -f "frontend/vite.config.js" ]; then
    echo "   ✅ Frontend: Vite configured"
fi

if [ -f "backend/src/server.js" ]; then
    echo "   ✅ Backend: Express server ready"
fi

if [ -f "backend/.env" ]; then
    echo "   ✅ Backend: .env configured"
else
    echo "   ⚠️  Backend: .env missing (copy from .env.example)"
fi

# Detect work context based on recent changes
echo ""
echo "🔍 Recent Activity:"

if git diff --name-only HEAD~1 2>/dev/null | grep -q "frontend/Components/"; then
    echo "   💼 Frontend component development detected"
    echo "   📖 Reference: frontend/Components/ folder"
fi

if git diff --name-only HEAD~1 2>/dev/null | grep -q "frontend/Pages/"; then
    echo "   📄 Frontend page development detected"
    echo "   📖 Reference: frontend/Pages/ folder"
fi

if git diff --name-only HEAD~1 2>/dev/null | grep -q "backend/src/routes/"; then
    echo "   🛣️  Backend API route changes detected"
    echo "   📖 Reference: backend/src/routes/ folder"
fi

if git diff --name-only HEAD~1 2>/dev/null | grep -q "backend/src/models/"; then
    echo "   🗂️  Backend model changes detected"
    echo "   📖 Reference: backend/src/models/ folder"
fi

if git diff --name-only HEAD~1 2>/dev/null | grep -q "backend/src/controllers/"; then
    echo "   🎮 Backend controller changes detected"
    echo "   📖 Reference: backend/src/controllers/ folder"
fi

if git diff --name-only HEAD~1 2>/dev/null | grep -q "frontend/Entities/\|backend/src/models/"; then
    echo "   ⚠️  Entity/model structure changes detected"
    echo "   📖 Ensure frontend and backend schemas are synchronized"
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "Ready to code! Use CLAUDE.md for quick reference."
echo ""
echo "Quick commands:"
echo "  npm run dev           - Start both frontend & backend"
echo "  npm run dev:frontend  - Frontend only (port 5173)"
echo "  npm run dev:backend   - Backend only (port 5000)"
