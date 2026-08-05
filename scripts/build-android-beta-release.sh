#!/usr/bin/env bash

# Back-compat shim: this script used to contain the full beta-flavor build
# logic. It has been generalized into build-android-release.sh, which now
# takes the flavor (dev/staging/beta/prod) as its first argument. This shim
# stays so any existing invocation/reference to
# `bash scripts/build-android-beta-release.sh [--clean]` keeps working.
#
# Prefer calling build-android-release.sh directly for new usage:
#   bash scripts/build-android-release.sh beta [--clean] [--pos-origin URL]

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/build-android-release.sh" beta "$@"
