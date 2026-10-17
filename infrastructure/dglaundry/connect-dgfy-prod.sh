#!/usr/bin/env bash
# One-time, root-run: connect DGLaundry PROD to DGFY PROD (#2304).
# Runs ON the prod host (ssh dgfy), where DGFY (/opt/dgfy-platform) and DGLaundry
# (/opt/dglaundry) live side by side.  Usage:
#
#   sudo bash connect-dgfy-prod.sh --check   # preflight only, changes nothing
#   sudo bash connect-dgfy-prod.sh           # do it
#
# Prod differs from staging (connect-dgfy-staging.sh): there is no installer, no
# /etc/dgfy/dglaundry config tree and no oidc-setup `apply` (the setup tool refuses
# production on purpose).  Prod's DGFY-owned key material is already in SOPS
# (/opt/dgfy-platform/secrets/*, #2303) and the OIDC clients are defined by
# docker-compose.api.yml's environment block, so there is nothing to "register" in
# a database.  This script therefore only adds what is still missing and NEVER
# restarts dgfy-api -- turning the integration on is a separate, separately
# approved step (host compose patch + deploy-sops.sh + recreate dgfy-api).
#
# Why root: DGFY's age key (/etc/dgfy/age/keys.txt) and DGLaundry's age key and
# secrets cache (/opt/dglaundry, owned by gha) are different identities, and the
# DGFY client secret must move from one to the other WITHOUT any human or AI
# reading it (ADR 0060 Decision 7).  No secret value is ever printed; only key
# NAMES, public fingerprints and PUBLIC key PEMs are.
#
# What it does:
#   1. Generates fresh DGLaundry-owned keypairs (machine-assertion RSA-3072,
#      request-signing EC P-256, event-signing Ed25519) in a root-only temp dir.
#   2. DGLaundry side FIRST: adds five secrets to the SOPS-encrypted cache
#      (prod-dglaundry-secrets.env) using DGLaundry's age key, so the private keys
#      are safe before anything on DGFY changes:
#        DGFY_CLIENT_SECRET                       <- DGFY's existing client secret, root-to-SOPS
#        DGFY_PARTNER_SIGNING_PRIVATE_KEY         <- new request-signing key
#        DGFY_PARTNER_CLIENT_ASSERTION_PRIVATE_KEY<- new machine-assertion key
#        DGFY_OUTBOUND_SIGNING_KEY                <- new event-signing key
#        DGFY_OUTBOUND_AUTH_TOKEN                 <- fresh random token
#   3. DGFY side: encrypts DGLaundry's three PUBLIC keys as whole-file SOPS binary
#      ciphertext (same format and age recipient as the existing key files) into
#      /opt/dgfy-platform/secrets/:
#        dglaundry-machine-assertion.pub.pem
#        dglaundry-request-signing.pub.pem
#        dglaundry-event-keys                     ({"<event kid>": "<pub PEM>"} registry)
#      deploy-sops.sh and docker-compose.api.yml must then be patched to consume them
#      (infrastructure/dglaundry/host-patches/).  Until then they are inert files.
#   4. Prints the public fingerprints and the DGFY PUBLIC keys DGLaundry needs in
#      prod.env.  Any failure before the end restores the cache and removes the
#      DGFY files this run created.
set -euo pipefail

CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

# DGFY_CONNECT_TEST=1 lets the paths below be overridden and skips the root check;
# it exists only so this script can be exercised against throwaway keys in a
# scratch directory.  Never set it on the real host.
if [[ "${DGFY_CONNECT_TEST:-0}" != 1 && "${EUID}" -ne 0 ]]; then
  echo "Run this with sudo: sudo bash $0 [--check]" >&2
  exit 1
fi

DGFY_ROOT="${DGFY_ROOT:-/opt/dgfy-platform}"
DGFY_SECRETS="$DGFY_ROOT/secrets"
DGFY_COMPOSE="$DGFY_ROOT/docker-compose.api.yml"
DGFY_AGE_KEY_FILE="${DGFY_AGE_KEY_FILE:-/etc/dgfy/age/keys.txt}"
DGL_ROOT="${DGL_ROOT:-/opt/dglaundry}"
CACHE="$DGL_ROOT/dgfy-secrets-cache/prod-dglaundry-secrets.env"
DGL_SOPS_BIN="${DGL_SOPS_BIN:-$DGL_ROOT/bin/sops}"
DGL_AGE_KEY_FILE="$DGL_ROOT/age/keys.txt"
SOPS_BIN="${SOPS_BIN:-$(command -v sops || echo /usr/local/bin/sops)}"   # DGFY side
AGE_KEYGEN="${AGE_KEYGEN:-$(command -v age-keygen || echo /usr/local/bin/age-keygen)}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Key IDs: these MUST match docs/integrations/dglaundry-connection-manifest.json
# (production.keyIds) and the DGFY compose block / prod.env.
DGFY_REQUEST_KID="dgfy-request-prod-p256"
DGFY_EVENT_KID="dgfy-event-prod-ed25519"
DGL_MACHINE_KID="dglaundry-machine-prod-rs256"
DGL_REQUEST_KID="dglaundry-request-prod-p256"
DGL_EVENT_KID="dglaundry-event-prod-ed25519"

DGFY_OWNED=(dgfy-oidc-private.pem dgfy-oidc-public.pem dglaundry-oidc-client-secret dgfy-event-signing.pem dgfy-request-signing.pem)
NEW_DGFY_FILES=(dglaundry-machine-assertion.pub.pem dglaundry-request-signing.pub.pem dglaundry-event-keys)
NEW_KEYS=(DGFY_CLIENT_SECRET DGFY_PARTNER_SIGNING_PRIVATE_KEY DGFY_PARTNER_CLIENT_ASSERTION_PRIVATE_KEY DGFY_OUTBOUND_SIGNING_KEY DGFY_OUTBOUND_AUTH_TOKEN)

echo "=== Preflight ==="
for f in "$DGFY_COMPOSE" "$DGFY_AGE_KEY_FILE" "$CACHE" "$DGL_SOPS_BIN" "$DGL_AGE_KEY_FILE" "$SOPS_BIN" "$AGE_KEYGEN"; do
  [[ -e "$f" ]] || { echo "Missing: $f" >&2; exit 1; }
done
for tool in openssl python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing tool: $tool" >&2; exit 1; }
done
for f in "${DGFY_OWNED[@]}"; do
  [[ -s "$DGFY_SECRETS/$f" ]] || { echo "Missing or empty DGFY secret: $DGFY_SECRETS/$f" >&2; exit 1; }
done
for f in "${NEW_DGFY_FILES[@]}"; do
  if [[ -e "$DGFY_SECRETS/$f" ]]; then
    echo "$DGFY_SECRETS/$f already exists; refusing to overwrite (already connected? remove it first if intended)." >&2
    exit 1
  fi
done
# The key IDs baked into the DGFY compose block must be the ones we generate against.
for kid in "$DGFY_REQUEST_KID" "$DGFY_EVENT_KID"; do
  grep -q -F "$kid" "$DGFY_COMPOSE" || { echo "$DGFY_COMPOSE does not mention key ID $kid; key IDs are out of sync with this script." >&2; exit 1; }
done

export SOPS_AGE_KEY_FILE="$DGFY_AGE_KEY_FILE"
# Decrypt-test every DGFY-owned file and prove the key halves are the right type,
# discarding the plaintext (nothing is printed).
for f in "${DGFY_OWNED[@]}"; do
  "$SOPS_BIN" decrypt "$DGFY_SECRETS/$f" >/dev/null 2>&1 || { echo "Cannot decrypt $DGFY_SECRETS/$f with $DGFY_AGE_KEY_FILE" >&2; exit 1; }
done
# Captured into variables (not piped into `grep -q`) so pipefail cannot trip on an early-exiting grep.
REQ_TEXT="$("$SOPS_BIN" decrypt "$DGFY_SECRETS/dgfy-request-signing.pem" | openssl pkey -noout -text 2>/dev/null)" \
  || { echo "dgfy-request-signing.pem is not a readable private key." >&2; exit 1; }
grep -q -E "prime256v1|P-256" <<<"$REQ_TEXT" || { echo "dgfy-request-signing.pem is not a P-256 key." >&2; exit 1; }
EVT_TEXT="$("$SOPS_BIN" decrypt "$DGFY_SECRETS/dgfy-event-signing.pem" | openssl pkey -noout -text 2>/dev/null)" \
  || { echo "dgfy-event-signing.pem is not a readable private key." >&2; exit 1; }
grep -q -i "ED25519" <<<"$EVT_TEXT" || { echo "dgfy-event-signing.pem is not an Ed25519 key." >&2; exit 1; }
unset REQ_TEXT EVT_TEXT
DGFY_AGE_PUB="$("$AGE_KEYGEN" -y "$DGFY_AGE_KEY_FILE")"
[[ "$DGFY_AGE_PUB" == age1* ]] || { echo "Could not derive the DGFY age recipient." >&2; exit 1; }

export SOPS_AGE_KEY_FILE="$DGL_AGE_KEY_FILE"
CACHE_KEYS="$("$DGL_SOPS_BIN" decrypt --input-type dotenv "$CACHE" | cut -d= -f1)" \
  || { echo "Cannot decrypt $CACHE with $DGL_AGE_KEY_FILE" >&2; exit 1; }
for k in "${NEW_KEYS[@]}"; do
  if grep -qx "$k" <<<"$CACHE_KEYS"; then
    echo "$k already exists in the DGLaundry prod secrets; refusing to overwrite (remove it first if intended)." >&2
    exit 1
  fi
done
echo "OK: DGFY-owned secrets decrypt and have the right key types; DGLaundry cache decrypts; none of the 5 DGFY secrets or 3 DGFY-side files exist yet."
echo "Existing DGLaundry cache keys (names only):"; sed 's/^/  /' <<<"$CACHE_KEYS"
if [[ "$CHECK_ONLY" == 1 ]]; then echo "--check: nothing changed."; exit 0; fi

umask 077
WORK="$(mktemp -d)"
chmod 700 "$WORK"
CACHE_BACKUP="$CACHE.bak-$STAMP"
CACHE_ARMED=0
CREATED=()   # DGFY-side files created by this run, removed on failure
rollback() {
  if [[ "$CACHE_ARMED" == 1 ]]; then
    echo "!! Restoring the DGLaundry SOPS cache from $CACHE_BACKUP." >&2
    cp -p "$CACHE_BACKUP" "$CACHE" 2>/dev/null || true
  fi
  for f in "${CREATED[@]:-}"; do
    [[ -n "$f" && -e "$f" ]] && { echo "!! Removing $f." >&2; rm -f "$f"; }
  done
}
cleanup() {
  local rc=$?
  [[ $rc -ne 0 ]] && rollback
  find "$WORK" -type f -exec shred -u {} + 2>/dev/null || rm -rf "$WORK"
  rm -rf "$WORK"
  exit $rc
}
trap cleanup EXIT

echo
echo "=== 1/4: generating DGLaundry prod keypairs (in $WORK; stored in SOPS before anything on DGFY changes) ==="
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$WORK/machine.pem" 2>/dev/null
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve -out "$WORK/request.pem" 2>/dev/null
openssl genpkey -algorithm ED25519 -out "$WORK/event.pem" 2>/dev/null
for k in machine request event; do
  openssl pkey -in "$WORK/$k.pem" -pubout -out "$WORK/$k.pub.pem"
done
fp() { openssl pkey -pubin -in "$1" -outform DER | openssl dgst -sha256 | awk '{print $NF}'; }
FP_MACHINE="$(fp "$WORK/machine.pub.pem")"
FP_REQUEST="$(fp "$WORK/request.pub.pem")"
FP_EVENT="$(fp "$WORK/event.pub.pem")"

echo
echo "=== 2/4: DGLaundry side -- add the five DGFY secrets to the SOPS cache (FIRST, so the private keys are safe) ==="
read -r OWNER_GROUP MODE < <(python3 -c 'import os,sys; s=os.stat(sys.argv[1]); print(f"{s.st_uid}:{s.st_gid}", oct(s.st_mode)[-3:])' "$CACHE")
cp -p "$CACHE" "$CACHE_BACKUP"
CACHE_ARMED=1
# DGFY's existing client secret, decrypted straight into a root-only temp file (never printed).
SOPS_AGE_KEY_FILE="$DGFY_AGE_KEY_FILE" "$SOPS_BIN" decrypt "$DGFY_SECRETS/dglaundry-oidc-client-secret" > "$WORK/client-secret"
[[ -s "$WORK/client-secret" ]] || { echo "DGFY client secret decrypted empty." >&2; exit 1; }
jsonval() { python3 -c 'import json,sys; sys.stdout.write(json.dumps(open(sys.argv[1]).read().rstrip("\n") if sys.argv[2]=="pem" else open(sys.argv[1]).read().strip()))' "$1" "$2"; }
put() {  # put <KEY> <file> <pem|raw>
  jsonval "$2" "$3" > "$WORK/val.json"
  SOPS_AGE_KEY_FILE="$DGL_AGE_KEY_FILE" "$DGL_SOPS_BIN" set --value-file --input-type dotenv --output-type dotenv "$CACHE" "[\"$1\"]" "$WORK/val.json"
}
openssl rand -hex 32 | tr -d '\n' > "$WORK/outbound-token"
put DGFY_CLIENT_SECRET                        "$WORK/client-secret"  raw
put DGFY_PARTNER_SIGNING_PRIVATE_KEY          "$WORK/request.pem"    pem
put DGFY_PARTNER_CLIENT_ASSERTION_PRIVATE_KEY "$WORK/machine.pem"    pem
put DGFY_OUTBOUND_SIGNING_KEY                 "$WORK/event.pem"      pem
put DGFY_OUTBOUND_AUTH_TOKEN                  "$WORK/outbound-token" raw
chown "$OWNER_GROUP" "$CACHE"; chmod "$MODE" "$CACHE"
AFTER="$(SOPS_AGE_KEY_FILE="$DGL_AGE_KEY_FILE" "$DGL_SOPS_BIN" decrypt --input-type dotenv "$CACHE" | cut -d= -f1)"
for k in "${NEW_KEYS[@]}"; do
  if grep -qx "$k" <<<"$AFTER"; then echo "  stored: $k"; else echo "MISSING after store: $k" >&2; exit 1; fi
done

echo
echo "=== 3/4: DGFY side -- encrypt DGLaundry's PUBLIC keys into $DGFY_SECRETS ==="
python3 - "$DGL_EVENT_KID" "$WORK/event.pub.pem" > "$WORK/dglaundry-event-keys" <<'PY'
import json, sys
kid, path = sys.argv[1], sys.argv[2]
print(json.dumps({kid: open(path).read()}))
PY
# Same ownership and mode as the existing DGFY key files, so deploy-sops.sh (run as the CI/pat account) can read them.
read -r DGFY_OWNER DGFY_MODE < <(python3 -c 'import os,sys; s=os.stat(sys.argv[1]); print(f"{s.st_uid}:{s.st_gid}", oct(s.st_mode)[-3:])' "$DGFY_SECRETS/dgfy-event-signing.pem")
enc() {  # enc <plaintext file> <dest name>
  local dest="$DGFY_SECRETS/$2" tmp="$DGFY_SECRETS/$2.tmp-$STAMP"
  # Registered BEFORE the write: the redirect below creates $tmp even if sops then fails.
  CREATED+=("$tmp" "$dest")
  "$SOPS_BIN" encrypt --age "$DGFY_AGE_PUB" --input-type binary --output-type binary "$1" > "$tmp"
  # Round-trip check: it must decrypt with the DGFY age key to exactly what we put in.
  SOPS_AGE_KEY_FILE="$DGFY_AGE_KEY_FILE" "$SOPS_BIN" decrypt "$tmp" | cmp -s - "$1" \
    || { echo "Round-trip check failed for $2." >&2; exit 1; }
  chown "$DGFY_OWNER" "$tmp"; chmod "$DGFY_MODE" "$tmp"
  mv "$tmp" "$dest"
  echo "  wrote: $dest"
}
enc "$WORK/machine.pub.pem"     dglaundry-machine-assertion.pub.pem
enc "$WORK/request.pub.pem"     dglaundry-request-signing.pub.pem
enc "$WORK/dglaundry-event-keys" dglaundry-event-keys

echo
echo "=== 4/4: summary ==="
DGFY_REQ_PUB="$WORK/dgfy-request.pub.pem"; DGFY_EVT_PUB="$WORK/dgfy-event.pub.pem"
SOPS_AGE_KEY_FILE="$DGFY_AGE_KEY_FILE" "$SOPS_BIN" decrypt "$DGFY_SECRETS/dgfy-request-signing.pem" | openssl pkey -pubout -out "$DGFY_REQ_PUB"
SOPS_AGE_KEY_FILE="$DGFY_AGE_KEY_FILE" "$SOPS_BIN" decrypt "$DGFY_SECRETS/dgfy-event-signing.pem"   | openssl pkey -pubout -out "$DGFY_EVT_PUB"
pubjson() { python3 -c 'import json,sys; print(json.dumps({sys.argv[1]: open(sys.argv[2]).read()}, separators=(",",":")))' "$1" "$2"; }
cat <<EOF

DONE. DGLaundry's private keys are in the SOPS cache; its public keys are in DGFY's SOPS store (inert until the host patch is applied).

Public fingerprints (sha256 of SPKI DER) -- record these in the connection manifest (production):
  $DGL_MACHINE_KID   $FP_MACHINE
  $DGL_REQUEST_KID   $FP_REQUEST
  $DGL_EVENT_KID   $FP_EVENT

DGFY's PUBLIC keys for DGLaundry's prod.env (public values, safe to share):
DGLAUNDRY_DGFY_PARTNER_PUBLIC_KEYS_JSON='$(pubjson "$DGFY_REQUEST_KID" "$DGFY_REQ_PUB")'
DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON='$(pubjson "$DGFY_EVENT_KID" "$DGFY_EVT_PUB")'

Backups: $CACHE_BACKUP
Next:
  1. Copy the updated ciphertext back into Sieitzz/dgfy-secrets:
       $CACHE  ->  prod/dglaundry/secrets.env
       $DGFY_SECRETS/{${NEW_DGFY_FILES[0]},${NEW_DGFY_FILES[1]},${NEW_DGFY_FILES[2]}}  ->  the prod dgfy secrets store
  2. Paste the output above to Claude (it is all public) to prepare the prod.env and manifest PRs.
  3. Apply the host patch (infrastructure/dglaundry/host-patches/) -- a separate, separately approved step.
EOF
