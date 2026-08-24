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

# Kill POS (Port 5174)
echo ""
echo "⚛️  POS (Port 5174):"
./scripts/kill-port.sh 5174

# Kill Storefront (Port 5175)
echo ""
echo "⚛️  Storefront (Port 5175):"
./scripts/kill-port.sh 5175

echo ""
echo "========================================"
echo "✅ All development servers cleaned up!"
echo ""
echo "You can now run:"
echo "  npm run dev                  # Backend + device-bridge + IMS"
echo "  npm run dev:local-pos-stack  # Backend + device-bridge + all 3 frontend apps"
echo "  npm run dev:backend          # Backend only"
echo "  npm run dev:skupervisor      # IMS only"
echo "  npm run dev:pos              # POS only"
echo "  npm run dev:store            # Storefront only"
