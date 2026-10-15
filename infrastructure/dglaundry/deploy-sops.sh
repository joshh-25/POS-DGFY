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

case "$ENV_NAME" in
  stage) HOST_ROOT="/opt/dglaundry-stage" ;;
  # No "-prod" suffix -- unlike sieitz-dgfy-remote (which hosts dev+stage side by side and needs
  # the suffix to disambiguate), the prod host runs exactly one DGLaundry environment, matching
  # /opt/dgfy-platform having no suffix there either.
  prod) HOST_ROOT="/opt/dglaundry" ;;
esac
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
# The 644 file permissions below rely entirely on this directory staying
# 0700 -- enforce it here rather than trusting whatever umask created it
# (a plain `mkdir -p` under the default 022 umask would leave it 0755,
# silently widening every secret file to world-readable at the directory
# level too -- PR #2453 review, RF-1).
chmod 700 "$SECRETS_DIR"

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
  case "$name" in
    # PEM private keys: dotenv is line-based, so they are stored single-line
    # with literal \n and expanded back to a real multi-line PEM file here.
    # (%b only touches backslash escapes; PEM bodies contain none.)
    dgfy_partner_signing_private_key|dgfy_partner_client_assertion_private_key|dgfy_outbound_signing_key)
      printf '%b\n' "$value" > "$SECRETS_DIR/$name" ;;
    *)
      printf '%s' "$value" > "$SECRETS_DIR/$name" ;;
  esac
  # 644, not 640 -- these are consumed via Docker Compose's file-based
  # `secrets:` construct, which bind-mounts this exact host file straight
  # into the container at /run/secrets/<name> with its host permissions
  # intact (no UID remap). The app process inside the container runs as
  # whatever UID the image defines, which has no reason to share this
  # environment's deploy user's GID -- group-readable access bought
  # nothing (confirmed live: migrate failed with EACCES on
  # mysql_migration_url before this fix). secrets/ itself stays 0700,
  # owned outright by whichever OS user this environment's deploy workflow
  # uses (sieitz for stage, gha for prod -- see each workflow's own host
  # setup), so a world-readable file bit here still can't be reached by
  # any other host user or process -- only a process with a bind mount
  # into this exact file (i.e. these containers) ever sees it.
  chmod 644 "$SECRETS_DIR/$name"
  echo "  wrote $SECRETS_DIR/$name"
done < <("$SOPS_BIN" decrypt --input-type dotenv "$CIPHERTEXT_CACHE")

echo
echo "== secrets materialized. =="
echo
echo "This script still only materializes secrets -- it does not check out"
echo "compose files or run 'docker compose' itself. .github/workflows/"
echo "deploy-dglaundry.yml / deploy-dglaundry-prod.yml (remote-deploy.sh) does"
echo "that end to end, including calling this script, for the normal path."
echo
echo "To bring the stack up by hand instead, from \$HOST_ROOT/current (only"
echo "docker-compose.production.yml -- no surebizcorp-lean.yml overlay, see"
echo "remote-deploy.sh's header comment for why):"
echo
echo "  docker compose --env-file $ENV_FILE -f docker-compose.production.yml up -d mysql"
echo "  docker compose --env-file $ENV_FILE -f docker-compose.production.yml up -d api worker gateway"
echo "  # (no separate 'run --rm migrate' step -- api's own depends_on already runs it once)"
