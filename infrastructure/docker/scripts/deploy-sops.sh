#!/usr/bin/env bash
# Decrypts the SOPS-encrypted secret files at /opt/dgfy-platform/secrets/ into
# the shell environment, then hands off to `docker compose up`. Implements
# docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md Phase 5 / Phase 6, and is what
# .github/workflows/publish-platform.yml calls for PROD once the cutover is
# live (see the "PLANNED, NOT YET LIVE" header comment in that file).
#
# Run from /opt/dgfy-platform on the server, as whichever account CI's
# SSH_TARGET names (must be in the `docker` group to read
# /etc/dgfy/age/keys.txt) -- or by Pat directly for a manual cutover/rollback
# rehearsal.
#
# Requires: sops, age (installed by setup-sops-age.sh, Phase 1), and
# secrets/{shared,mysql,dgfy-api}.env already present (Phase 2, Pat runs this
# personally -- see ADR 0060 Decision 7, `binding`).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
# ^ infrastructure/docker/scripts/ -> repo/server root. On the real server
# this file is copied to /opt/dgfy-platform/deploy-sops.sh directly (that
# directory is hand-maintained, not a git checkout -- see the runbook's
# "Server facts" section), so this cd is a no-op there; it only matters when
# testing this script from a repo checkout.

export SOPS_AGE_KEY_FILE=/etc/dgfy/age/keys.txt
SECRET_FILES=(secrets/shared.env secrets/mysql.env secrets/dgfy-api.env)

set -a
for f in "${SECRET_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "::error::deploy-sops.sh: missing secret file $f -- refusing to start with a partial secret set" >&2
    exit 1
  fi
  # read/export, NOT `source <(...)` -- source executes decrypted text as
  # bash script, corrupting any value containing a literal $ (e.g. a bcrypt
  # hash -- ADMIN_PASSWORD_HASH and the bcrypt entries inside
  # ADMIN_ACCOUNTS_JSON both do). See ADR 0060 Decision 6 (binding).
  while IFS='=' read -r key value; do
    # Skip blank lines and comments -- sops's dotenv output can carry both,
    # and `export ""` / `export "# foo"` would otherwise either no-op oddly
    # or corrupt the env with a junk entry.
    [ -z "$key" ] && continue
    case "$key" in \#*) continue ;; esac
    # sops occasionally emits dotenv values wrapped in double quotes; strip
    # a matching pair so the exported value matches what was encrypted, not
    # a quoted string containing the value.
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value#\"}"
      value="${value%\"}"
    fi
    export "$key=$value"
  done < <(sops decrypt --input-type dotenv "$f")
done
set +a

# Fail loudly, before any container is touched, if the assembled environment
# is missing something apps/dgfy-api/src/config/productionEnvValidation.cjs
# requires -- turns the crash-loop failure class into a pre-flight check.
#
# NOT `npm run check:production-env` (scripts/check-production-env-fixtures.js)
# -- that validates hardcoded fixture scenarios, not the real assembled env.
# check-assembled-env.cjs (sibling script, same directory) calls the same
# validateProductionEnv() function against the actual process environment
# this loop just built. See infrastructure/docker/env/
# prod.env-var-classification.md for the full boot-required list this checks.
GATE_SCRIPT="$(dirname "${BASH_SOURCE[0]}")/check-assembled-env.cjs"
if [ -f "$GATE_SCRIPT" ] && command -v node >/dev/null 2>&1; then
  if ! node "$GATE_SCRIPT"; then
    echo "::error::deploy-sops.sh: assembled environment fails the production boot check -- aborting before docker compose up. Fix the missing/invalid vars, do not retry blind." >&2
    exit 1
  fi
else
  echo "::error::deploy-sops.sh: check-assembled-env.cjs or node not available -- refusing to deploy without the pre-flight validation gate. Do not bypass this by removing the check." >&2
  exit 1
fi

docker compose pull
exec docker compose up -d --remove-orphans
