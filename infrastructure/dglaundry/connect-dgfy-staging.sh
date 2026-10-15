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
#   2. DGLaundry side FIRST: adds five secrets to the SOPS-encrypted cache
#      (stage-dglaundry-secrets.env) using this host's DGLaundry age key, so the
#      private keys are safe before anything on DGFY changes:
#        DGFY_CLIENT_SECRET                       <- DGFY's existing client secret, copied root-to-SOPS
#        DGFY_PARTNER_SIGNING_PRIVATE_KEY         <- new request-signing key
#        DGFY_PARTNER_CLIENT_ASSERTION_PRIVATE_KEY<- new machine-assertion key
#        DGFY_OUTBOUND_SIGNING_KEY                <- new event-signing key
#        DGFY_OUTBOUND_AUTH_TOKEN                 <- fresh random token
#      PEMs are stored as dotenv values with \n escapes; deploy-sops.sh expands
#      them back to multi-line PEM files at deploy time.
#   3. DGFY side: swaps the 3 public keys in /etc/dgfy/dglaundry/staging/keys,
#      updates their fingerprints and the event key ID in the live manifest, then
#      runs the existing run-oidc-setup.sh --apply (prepare -> apply -> verify ->
#      restart dgfy-api).  Any failure BEFORE the restart restores the old public
#      keys, the manifest AND the SOPS cache.  After the restart nothing is rolled
#      back (the new keys are live); the script just waits for the API to serve JWKS.
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
NEW_EVENT_KID="dglaundry-event-stage-ed25519-r3"   # -r2 was burned by a run that reached apply (see APPLIED_ENV check below)
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
APPLIED_ENV="$DGFY_CFG/dglaundry-connection.env"
if [[ -f "$APPLIED_ENV" ]] && grep -q -F "$NEW_EVENT_KID" "$APPLIED_ENV"; then
  echo "Event key ID $NEW_EVENT_KID is already registered in $APPLIED_ENV; bump NEW_EVENT_KID (-r4, ...) in this script AND stage.env/the manifest." >&2
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
CACHE_BACKUP="$CACHE.bak-$STAMP"
CACHE_ARMED=0   # restore the SOPS cache on failure
DGFY_ARMED=0    # restore DGFY-side public keys + manifest on failure
# Both are disarmed the moment dgfy-api has been restarted (the point of no
# return): after that the new keys are live and rolling the files back would
# strand them -- a previous run lost its private keys exactly that way.  By then
# the private keys are already safe in the SOPS cache (step 2 runs first).
rollback() {
  if [[ "$DGFY_ARMED" == 1 ]]; then
    echo "!! Restoring DGFY-side public keys and manifest." >&2
    cp -p "$BACKUP_DIR"/dglaundry-*.pub.pem "$KEYS_DIR"/ 2>/dev/null || true
    cp -p "$BACKUP_DIR/dglaundry-connection-manifest.json" "$MANIFEST" 2>/dev/null || true
  fi
  if [[ "$CACHE_ARMED" == 1 ]]; then
    echo "!! Restoring the SOPS cache from $CACHE_BACKUP." >&2
    cp -p "$CACHE_BACKUP" "$CACHE" 2>/dev/null || true
  fi
}
cleanup() {
  local rc=$?
  [[ $rc -ne 0 ]] && rollback
  find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf "$WORK"
  exit $rc
}
trap cleanup EXIT

echo
echo "=== 1/4: generating DGLaundry staging keypairs (in $WORK; stored in SOPS before anything on DGFY changes) ==="
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
OWNER_GROUP="$(stat -c '%u:%g' "$CACHE")"; MODE="$(stat -c '%a' "$CACHE")"
cp -p "$CACHE" "$CACHE_BACKUP"
CACHE_ARMED=1
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
AFTER="$("$SOPS_BIN" decrypt --input-type dotenv "$CACHE" | cut -d= -f1)"
for k in "${NEW_KEYS[@]}"; do
  if grep -qx "$k" <<<"$AFTER"; then echo "  stored: $k"; else echo "MISSING after store: $k" >&2; exit 1; fi
done

echo
echo "=== 3/4: DGFY side -- swap DGLaundry public keys, update manifest, apply, restart ==="
install -d -o root -g root -m 0700 "$BACKUP_DIR"
cp -p "$KEYS_DIR"/dglaundry-*.pub.pem "$BACKUP_DIR"/
cp -p "$MANIFEST" "$BACKUP_DIR/dglaundry-connection-manifest.json"
DGFY_ARMED=1
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

# prepare -> apply -> verify -> restart dgfy-api -> JWKS (existing, proven path).
# Its final JWKS check only waits 5s for a container that needs ~1-2 min to boot,
# so a non-zero exit AFTER the restart is expected and is NOT a reason to roll back.
set +e
bash "$TOOLS_DIR/run-oidc-setup.sh" --apply 2>&1 | tee "$WORK/oidc.log"
RC=${PIPESTATUS[0]}
set -e
if grep -q "Restarting dgfy-api" "$WORK/oidc.log"; then
  DGFY_ARMED=0; CACHE_ARMED=0   # point of no return reached: new keys are live
  if [[ $RC -ne 0 ]]; then
    echo "run-oidc-setup.sh exited $RC after restarting dgfy-api (its 5s JWKS check is too short); waiting for the API myself."
  fi
elif [[ $RC -ne 0 ]]; then
  echo "run-oidc-setup.sh failed BEFORE the dgfy-api restart (exit $RC)." >&2
  exit "$RC"
fi

echo "Waiting for https://api.stage.dgfy.ph/oidc/jwks to return 200 (up to 5 min)..."
READY=0
for _ in $(seq 1 60); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' https://api.stage.dgfy.ph/oidc/jwks || true)"
  if [[ "$CODE" == 200 ]]; then READY=1; break; fi
  sleep 5
done
if [[ "$READY" != 1 ]]; then
  echo "dgfy-api did not serve JWKS within 5 min (last HTTP $CODE). The new keys ARE live and safely stored in SOPS;" >&2
  echo "inspect: docker logs --tail 80 dgfy-platform-staging-dgfy-api-1" >&2
  exit 1
fi
echo "JWKS 200."

echo
echo "=== 4/4: summary ==="
echo "  (pre-existing cache keys: $(grep -c . <<<"$CACHE_KEYS") before, $(grep -c . <<<"$AFTER") after)"
cat <<EOF

DONE. Public fingerprints (sha256 of SPKI DER), now trusted by DGFY staging:
  dglaundry-machine-stage-rs256   $FP_MACHINE
  dglaundry-request-stage-p256    $FP_REQUEST
  $NEW_EVENT_KID   $FP_EVENT

Backups: $CACHE_BACKUP   and   $BACKUP_DIR
Next:
  1. Copy $CACHE back into Sieitzz/dgfy-secrets as stage/dglaundry/secrets.env (ciphertext).
  2. Merge the stage.env PR, then dispatch deploy-dglaundry.yml (staging).
EOF
