#!/usr/bin/env bash
set -Eeuo pipefail

echo "[deploy-remote] Direct local production deployment is disabled." >&2
echo "[deploy-remote] Use the root-owned external signed release controller defined by ADR 0030." >&2
exit 1
