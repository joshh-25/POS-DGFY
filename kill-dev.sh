#!/bin/bash
# Kill All Development Servers
# This script kills processes on common development ports

echo "🧹 Cleaning up development servers..."
echo "========================================"

# Kill Backend (Port 5000)
echo ""
echo "🔧 Backend (Port 5000):"
./kill-port.sh 5000

# Kill Frontend (Port 5173)
echo ""
echo "⚛️  Frontend (Port 5173):"
./kill-port.sh 5173

# Kill Alternative Frontend (Port 5174)
echo ""
echo "⚛️  Alternative Frontend (Port 5174):"
./kill-port.sh 5174

echo ""
echo "========================================"
echo "✅ All development servers cleaned up!"
echo ""
echo "You can now run:"
echo "  npm run dev           # Start both"
echo "  npm run dev:backend   # Backend only"
echo "  npm run dev:frontend  # Frontend only"
