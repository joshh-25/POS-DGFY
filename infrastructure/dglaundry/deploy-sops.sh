#!/usr/bin/env bash
# Materializes DGLaundry's SOPS-encrypted secrets into the plaintext files
# its own Docker Compose file-based `secrets:` mounts expect, then prints the
# exact compose commands to bring the stack up (see "What this does NOT do
# yet" below for why this stops short of running them).
#
# Usage: ./deploy-sops.sh <stage|prod>
#
# Written once, parameterized by environment -- every path below is derived
# from the one argument, so stage and prod never need separate copies of
# this script. See README.md for the full layout and the per-environment
# host prerequisites this assumes already exist (age key, sops/age
# binaries, the secrets/ directory and its dedicated group).
set -euo pipefail

ENV_NAME="${1:?Usage: $0 <stage|prod>}"
case "$ENV_NAME" in
  stage|prod) ;;
  *) echo "Unknown environment '$ENV_NAME' -- expected 'stage' or 'prod'" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/${ENV_NAME}.env"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }

HOST_ROOT="/opt/dglaundry-${ENV_NAME}"
AGE_KEY_FILE="$HOST_ROOT/age/keys.txt"
# Cached ciphertext, synced from Sieitzz/dgfy-secrets's
# <env>/dglaundry/secrets.env whenever it's rotated -- this script does not
# `git pull` the secrets repo itself (the host has no GitHub credentials
# provisioned for that, and ciphertext is safe to cache at rest regardless;
# see ADR 0060's threat model). The repo copy stays authoritative.
CIPHERTEXT_CACHE="$HOST_ROOT/dgfy-secrets-cache/${ENV_NAME}-dglaundry-secrets.env"
SOPS_BIN="$HOST_ROOT/bin/sops"
SECRETS_DIR="$HOST_ROOT/secrets"

for f in "$AGE_KEY_FILE" "$CIPHERTEXT_CACHE"; do
  [ -f "$f" ] || { echo "Missing required file: $f" >&2; exit 1; }
done
[ -x "$SOPS_BIN" ] || SOPS_BIN="sops"
[ -d "$SECRETS_DIR" ] || { echo "Missing $SECRETS_DIR -- create it first (see README.md)" >&2; exit 1; }

export SOPS_AGE_KEY_FILE="$AGE_KEY_FILE"

echo "== decrypting $CIPHERTEXT_CACHE into $SECRETS_DIR/<name> =="
# read/export pattern per ADR 0060 Decision 6 -- never `source <(sops
# decrypt ...)`, which executes decrypted text as bash and corrupts any
# value containing a literal $. Here we write files instead of exporting
# shell vars (DGLaundry's compose uses file-based `secrets:`, not
# `environment:` blocks), but the same never-eval rule applies: write with
# printf, never let the decrypted content pass through a shell that
# interprets it.
while IFS='=' read -r key value; do
  [ -z "$key" ] && continue
  case "$key" in \#*) continue ;; esac
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value#\"}"
    value="${value%\"}"
  fi
  name="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')"
  printf '%s' "$value" > "$SECRETS_DIR/$name"
  chmod 640 "$SECRETS_DIR/$name"
  echo "  wrote $SECRETS_DIR/$name"
done < <("$SOPS_BIN" decrypt --input-type dotenv "$CIPHERTEXT_CACHE")

echo
echo "== secrets materialized. =="
echo
echo "What this does NOT do yet, and why:"
echo "  - It does not run 'docker compose up'. This environment's $ENV_FILE"
echo "    still carries at least one REPLACE_BEFORE_DEPLOY placeholder"
echo "    (DGLAUNDRY_MIGRATION_REQUIRED_HEAD) that Compose's own :? guard"
echo "    will hard-fail on -- filling it in requires DGLaundry to confirm"
echo "    the reviewed migration head for the pinned release SHA first."
echo "  - It does not check out DGLaundry's own docker-compose.production.yml"
echo "    onto this host. Pin and copy it from Sieitzz/dglaundry at the exact"
echo "    release SHA named in $ENV_FILE (DGLAUNDRY_RELEASE_SHA) into"
echo "    $HOST_ROOT/releases/<sha>/, then symlink $HOST_ROOT/current -> it."
echo
echo "Once both of those are done, bring the stack up from $HOST_ROOT/current:"
echo
echo "  docker compose --env-file $ENV_FILE -f docker-compose.production.yml up -d mysql"
echo "  docker compose --env-file $ENV_FILE -f docker-compose.production.yml run --rm migrate"
echo "  docker compose --env-file $ENV_FILE -f docker-compose.production.yml up -d api worker gateway"
