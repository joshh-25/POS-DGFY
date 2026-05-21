#!/bin/bash
# Kill All Development Servers
# This script kills processes on common development ports
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

echo "🧹 Cleaning up development servers..."
echo "========================================"

# Kill Backend (Port 5000)
echo ""
echo "🔧 Backend (Port 5000):"
./scripts/kill-port.sh 5000

# Kill Frontend (Port 5173)
echo ""
echo "⚛️  Frontend (Port 5173):"
./scripts/kill-port.sh 5173

# Kill Alternative Frontend (Port 5174)
echo ""
echo "⚛️  Alternative Frontend (Port 5174):"
./scripts/kill-port.sh 5174

echo ""
echo "========================================"
echo "✅ All development servers cleaned up!"
echo ""
echo "You can now run:"
echo "  npm run dev           # Start both"
echo "  npm run dev:backend   # Backend only"
echo "  npm run dev:frontend  # Frontend only"
