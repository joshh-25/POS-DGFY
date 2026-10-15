#!/usr/bin/env bash
# One-time, root-run: connect DGLaundry staging to DGFY staging (#2304).
# Runs ON sieitz-dgfy-remote (DGFY staging and DGLaundry staging share that
# host).  Usage:
#
#   sudo bash connect-dgfy-staging.sh --check   # preflight only, changes nothing
#   sudo bash connect-dgfy-staging.sh           # do it
#
# Why root: DGFY's DGLaundry connection config (/etc/dgfy/dglaundry/staging)
# is root-only, and the browser client secret DGFY already holds must reach
# DGLaundry WITHOUT any human or AI reading it (ADR 0060 Decision 7).  No secret
# value is ever printed; only key NAMES and public fingerprints are.
#
# What it does:
#   1. Generates fresh DGLaundry-owned keypairs (machine-assertion RSA-3072,
#      request-signing EC P-256, event-signing Ed25519) in a root-only temp dir.
#      The DGLaundry public keys DGFY trusts today came from the DGLaundry
#      owner; the matching private halves are not on this host and the legacy
#      deployment never used DGFY mode, so they are replaced.
#   2. DGFY side: swaps the 3 public keys in /etc/dgfy/dglaundry/staging/keys,
#      updates their fingerprints in the live manifest, then runs the existing
#      run-oidc-setup.sh --apply (prepare -> apply -> verify -> restart
#      dgfy-api -> JWKS check).  On any failure BEFORE that restart the old
#      public keys and manifest are restored.
#   3. DGLaundry side: adds five secrets to the SOPS-encrypted cache
#      (stage-dglaundry-secrets.env) using this host's DGLaundry age key:
#        DGFY_CLIENT_SECRET                       <- DGFY's existing client secret, copied root-to-SOPS
#        DGFY_PARTNER_SIGNING_PRIVATE_KEY         <- new request-signing key
#        DGFY_PARTNER_CLIENT_ASSERTION_PRIVATE_KEY<- new machine-assertion key
#        DGFY_OUTBOUND_SIGNING_KEY                <- new event-signing key
#        DGFY_OUTBOUND_AUTH_TOKEN                 <- fresh random token
#      PEMs are stored as dotenv values with \n escapes; deploy-sops.sh expands
#      them back to multi-line PEM files at deploy time.
#   4. Prints the public fingerprints and the next steps.  The updated
#      ciphertext must then be copied back into Sieitzz/dgfy-secrets
#      (stage/dglaundry/secrets.env) so the repo stays the source of truth.
set -euo pipefail

CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this with sudo: sudo bash $0 [--check]" >&2
  exit 1
fi

DGFY_CFG="/etc/dgfy/dglaundry/staging"
KEYS_DIR="$DGFY_CFG/keys"
MANIFEST="$DGFY_CFG/dglaundry-connection-manifest.json"
CLIENT_SECRET_FILE="$DGFY_CFG/dglaundry-oidc-client-secret"
TOOLS_DIR="/opt/dgfy-stage/dglaundry-tools"
DGL_ROOT="/opt/dglaundry-stage"
CACHE="$DGL_ROOT/dgfy-secrets-cache/stage-dglaundry-secrets.env"
SOPS_BIN="$DGL_ROOT/bin/sops"
AGE_KEY_FILE="$DGL_ROOT/age/keys.txt"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
STAMP="$(date +%Y%m%d-%H%M%S)"
# DGFY's setup tool keeps DGLaundry's EVENT key in a key-ID-keyed rotation registry and
# refuses (DGLAUNDRY_EVENT_KEY_ID_REUSE) to attach a different public key to an existing
# ID, so the fresh event key gets a new ID.  (Machine-assertion and request-signing keys
# are single files with no such registry, so their IDs stay.)
NEW_EVENT_KID="dglaundry-event-stage-ed25519-r2"
NEW_KEYS=(DGFY_CLIENT_SECRET DGFY_PARTNER_SIGNING_PRIVATE_KEY DGFY_PARTNER_CLIENT_ASSERTION_PRIVATE_KEY DGFY_OUTBOUND_SIGNING_KEY DGFY_OUTBOUND_AUTH_TOKEN)

echo "=== Preflight ==="
for f in "$MANIFEST" "$CLIENT_SECRET_FILE" "$TOOLS_DIR/run-oidc-setup.sh" "$CACHE" "$SOPS_BIN" "$AGE_KEY_FILE"; do
  [[ -e "$f" ]] || { echo "Missing: $f" >&2; exit 1; }
done
[[ -d "$KEYS_DIR" ]] || { echo "Missing: $KEYS_DIR" >&2; exit 1; }
[[ -s "$CLIENT_SECRET_FILE" ]] || { echo "DGFY client secret file is empty: $CLIENT_SECRET_FILE" >&2; exit 1; }
for tool in openssl python3 "$NODE_BIN"; do
  command -v "$tool" >/dev/null 2>&1 || [[ -x "$tool" ]] || { echo "Missing tool: $tool" >&2; exit 1; }
done

CURRENT_EVENT_KID="$("$NODE_BIN" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).environments.staging.keyIds.dglaundryEventSigning)' "$MANIFEST")"
if [[ "$CURRENT_EVENT_KID" == "$NEW_EVENT_KID" ]]; then
  echo "Manifest already uses event key ID $NEW_EVENT_KID; refusing (already rotated?)." >&2
  exit 1
fi
echo "Event key ID will change: $CURRENT_EVENT_KID -> $NEW_EVENT_KID"

export SOPS_AGE_KEY_FILE="$AGE_KEY_FILE"
CACHE_KEYS="$("$SOPS_BIN" decrypt --input-type dotenv "$CACHE" | cut -d= -f1)" \
  || { echo "Cannot decrypt $CACHE with $AGE_KEY_FILE" >&2; exit 1; }
for k in "${NEW_KEYS[@]}"; do
  if grep -qx "$k" <<<"$CACHE_KEYS"; then
    echo "$k already exists in the DGLaundry staging secrets; refusing to overwrite (remove it first if intended)." >&2
    exit 1
  fi
done
echo "OK: all inputs present, cache decrypts, none of the 5 DGFY secrets exist yet."
echo "Existing cache keys (names only):"; sed 's/^/  /' <<<"$CACHE_KEYS"
if [[ "$CHECK_ONLY" == 1 ]]; then echo "--check: nothing changed."; exit 0; fi

umask 077
WORK="$(mktemp -d)"
chmod 700 "$WORK"
BACKUP_DIR="$KEYS_DIR/.backup-$STAMP"
RESTORE_ARMED=0
cleanup() {
  local rc=$?
  if [[ "$RESTORE_ARMED" == 1 && $rc -ne 0 ]]; then
    echo "!! Failure before the dgfy-api restart -- restoring DGFY-side public keys and manifest." >&2
    cp -p "$BACKUP_DIR"/dglaundry-*.pub.pem "$KEYS_DIR"/ 2>/dev/null || true
    cp -p "$BACKUP_DIR/dglaundry-connection-manifest.json" "$MANIFEST" 2>/dev/null || true
  fi
  find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf "$WORK"
  exit $rc
}
trap cleanup EXIT

echo
echo "=== 1/4: generating DGLaundry staging keypairs (private keys stay in $WORK until stored) ==="
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
echo "=== 2/4: DGFY side -- swap DGLaundry public keys, update manifest, apply ==="
install -d -o root -g root -m 0700 "$BACKUP_DIR"
cp -p "$KEYS_DIR"/dglaundry-*.pub.pem "$BACKUP_DIR"/
cp -p "$MANIFEST" "$BACKUP_DIR/dglaundry-connection-manifest.json"
RESTORE_ARMED=1
install -o root -g root -m 0644 "$WORK/machine.pub.pem" "$KEYS_DIR/dglaundry-machine-assertion.pub.pem"
install -o root -g root -m 0644 "$WORK/request.pub.pem" "$KEYS_DIR/dglaundry-request-signing.pub.pem"
install -o root -g root -m 0644 "$WORK/event.pub.pem"   "$KEYS_DIR/dglaundry-event-signing.pub.pem"
"$NODE_BIN" -e '
const fs = require("fs");
const [path, m, r, e, kid] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
Object.assign(manifest.environments.staging.keyFingerprintsSha256, {
  dglaundryMachineAssertion: m, dglaundryRequestSigning: r, dglaundryEventSigning: e,
});
manifest.environments.staging.keyIds.dglaundryEventSigning = kid;
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
' "$MANIFEST" "$FP_MACHINE" "$FP_REQUEST" "$FP_EVENT" "$NEW_EVENT_KID"
chmod 0640 "$MANIFEST"; chown root:root "$MANIFEST"
# prepare -> apply -> verify -> restart dgfy-api -> JWKS (existing, proven path)
bash "$TOOLS_DIR/run-oidc-setup.sh" --apply
RESTORE_ARMED=0

echo
echo "=== 3/4: DGLaundry side -- add the five DGFY secrets to the SOPS cache ==="
OWNER_GROUP="$(stat -c '%u:%g' "$CACHE")"; MODE="$(stat -c '%a' "$CACHE")"
cp -p "$CACHE" "$CACHE.bak-$STAMP"
jsonval() { python3 -c 'import json,sys; sys.stdout.write(json.dumps(open(sys.argv[1]).read().rstrip("\n") if sys.argv[2]=="pem" else open(sys.argv[1]).read().strip()))' "$1" "$2"; }
put() {  # put <KEY> <file> <pem|raw>
  jsonval "$2" "$3" > "$WORK/val.json"
  "$SOPS_BIN" set --value-file --input-type dotenv --output-type dotenv "$CACHE" "[\"$1\"]" "$WORK/val.json"
}
openssl rand -hex 32 | tr -d '\n' > "$WORK/outbound-token"
put DGFY_CLIENT_SECRET                        "$CLIENT_SECRET_FILE"  raw
put DGFY_PARTNER_SIGNING_PRIVATE_KEY          "$WORK/request.pem"    pem
put DGFY_PARTNER_CLIENT_ASSERTION_PRIVATE_KEY "$WORK/machine.pem"    pem
put DGFY_OUTBOUND_SIGNING_KEY                 "$WORK/event.pem"      pem
put DGFY_OUTBOUND_AUTH_TOKEN                  "$WORK/outbound-token" raw
chown "$OWNER_GROUP" "$CACHE"; chmod "$MODE" "$CACHE"

echo
echo "=== 4/4: verify (names only) ==="
AFTER="$("$SOPS_BIN" decrypt --input-type dotenv "$CACHE" | cut -d= -f1)"
for k in "${NEW_KEYS[@]}"; do grep -qx "$k" <<<"$AFTER" && echo "  present: $k" || { echo "MISSING: $k" >&2; exit 1; }; done
echo "  (pre-existing keys unchanged: $(grep -c . <<<"$CACHE_KEYS") before, $(grep -c . <<<"$AFTER") after)"

cat <<EOF

DONE. Public fingerprints (sha256 of SPKI DER), now trusted by DGFY staging:
  dglaundry-machine-stage-rs256   $FP_MACHINE
  dglaundry-request-stage-p256    $FP_REQUEST
  $NEW_EVENT_KID   $FP_EVENT

Backups: $CACHE.bak-$STAMP   and   $BACKUP_DIR
Next:
  1. Copy $CACHE back into Sieitzz/dgfy-secrets as stage/dglaundry/secrets.env (ciphertext).
  2. Merge the stage.env PR, then dispatch deploy-dglaundry.yml (staging).
EOF
