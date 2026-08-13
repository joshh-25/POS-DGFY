#!/usr/bin/env bash
# Installs sops + age on a Docker-Engine host and generates the production
# age keypair at /etc/dgfy/age/keys.txt. Implements
# docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md Phase 1.
#
# Run as: sudo ./setup-sops-age.sh
#
# Idempotent: safe to re-run. Re-running does NOT regenerate an existing
# keypair (that would make every secret already encrypted to the old key
# unreadable) -- it only reinstalls the binaries and re-prints the existing
# public key.
#
# Pin AGE_VERSION/SOPS_VERSION to a version you've actually checked against
# https://github.com/FiloSottile/age/releases and
# https://github.com/getsops/sops/releases -- do not float `latest` here.
# Last confirmed current 2026-08-13: age v1.3.1, sops v3.13.3 (this
# runbook originally cited v1.2.1/v3.9.4 from memory, which were already
# stale by the time this was first written -- verify, don't trust old pins).
set -euo pipefail

AGE_VERSION="v1.3.1"
SOPS_VERSION="v3.13.3"
KEY_FILE=/etc/dgfy/age/keys.txt

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo $0" >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d /tmp/sops-age-install.XXXXXX)"
trap 'rm -rf "$STAGE_DIR"' EXIT
cd "$STAGE_DIR"

echo "== downloading age $AGE_VERSION =="
curl -fsSLo age.tar.gz "https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/age-${AGE_VERSION}-linux-amd64.tar.gz"
tar xzf age.tar.gz

echo "== downloading + checksum-verifying sops $SOPS_VERSION =="
SOPS_ASSET="sops-${SOPS_VERSION}.linux.amd64"
curl -fsSLo "$SOPS_ASSET" "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/${SOPS_ASSET}"
curl -fsSLo sops-checksums.txt "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.checksums.txt"
grep "$SOPS_ASSET" sops-checksums.txt | sha256sum -c -
cp "$SOPS_ASSET" sops && chmod +x sops

echo "== installing to /usr/local/bin =="
install -m 0755 age/age age/age-keygen /usr/local/bin/
install -m 0755 sops /usr/local/bin/sops
sops --version
age --version

if [ -f "$KEY_FILE" ]; then
  echo
  echo "== $KEY_FILE already exists -- NOT overwriting =="
else
  echo
  echo "== generating the age keypair at $KEY_FILE =="
  mkdir -p "$(dirname "$KEY_FILE")"
  age-keygen -o "$KEY_FILE"
  chown root:docker "$KEY_FILE"
  chmod 0640 "$KEY_FILE"
fi

PUBLIC_KEY="$(grep -oP 'public key: \K.*' "$KEY_FILE")"
echo
echo "================================================================"
echo "PUBLIC KEY (safe to share -- goes in Sieitzz/dgfy-secrets/.sops.yaml):"
echo
echo "  $PUBLIC_KEY"
echo "================================================================"

echo
echo "== Bitwarden escrow =="
echo "Copy the FULL contents of $KEY_FILE into a Bitwarden secure note now"
echo "(e.g. titled 'DGFY prod age key -- break-glass only'):"
echo
cat "$KEY_FILE"
echo
echo "Once saved, paste your Bitwarden copy of the AGE-SECRET-KEY-1... line"
echo "below to verify the escrow actually works. Leave blank to skip."
echo -n "> "
read -r ESCROW_KEY

if [ -n "$ESCROW_KEY" ]; then
  echo "test=value" | sops --age "$PUBLIC_KEY" \
    --input-type dotenv --output-type dotenv --encrypt /dev/stdin > "$STAGE_DIR/escrow-test.env"
  RESULT="$(SOPS_AGE_KEY="$ESCROW_KEY" sops decrypt --input-type dotenv "$STAGE_DIR/escrow-test.env")"
  if [ "$RESULT" = "test=value" ]; then
    echo "OK -- escrow copy decrypts correctly."
  else
    echo "MISMATCH -- got '$RESULT', expected 'test=value'. Re-check what you pasted." >&2
    exit 1
  fi
else
  echo "Skipped escrow verification -- run it yourself later, don't forget."
fi

echo
echo "Done. Key is live at $KEY_FILE (root:docker, 0640)."
