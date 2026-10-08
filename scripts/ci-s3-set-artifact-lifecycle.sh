#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "::error::$1" >&2
  exit 1
}

if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != "--apply" ) ]]; then
  fail "Usage: ci-s3-set-artifact-lifecycle.sh [--apply]"
fi

apply=false
if [[ "${1:-}" == "--apply" ]]; then
  apply=true
fi

[[ -n "${AWS_ACCESS_KEY_ID:-}" ]] || fail "S3 access key ID is unavailable."
[[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]] || fail "S3 secret access key is unavailable."
[[ -n "${S3_BUCKET:-}" ]] || fail "S3 bucket setting is unavailable."
command -v aws >/dev/null 2>&1 || fail "AWS CLI v2 is required to manage bucket lifecycle configuration."
command -v python3 >/dev/null 2>&1 || fail "Python 3 is required to preserve and validate lifecycle rules."

endpoint_url="https://s3.patteruel.dev"
aws_region="${AWS_DEFAULT_REGION:-us-east-1}"
tmp_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ci-s3-lifecycle.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

export AWS_EC2_METADATA_DISABLED=true
export AWS_DEFAULT_REGION="$aws_region"
export AWS_CONFIG_FILE="$tmp_dir/aws-config"
export AWS_SHARED_CREDENTIALS_FILE="$tmp_dir/aws-credentials"
unset AWS_PROFILE || true
cat > "$AWS_CONFIG_FILE" <<AWS_CONFIG
[default]
region = $aws_region
s3 =
    addressing_style = path
AWS_CONFIG

if aws s3api get-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" --endpoint-url "$endpoint_url" --no-cli-pager \
  >"$tmp_dir/current.json" 2>"$tmp_dir/get.log"; then
  :
elif grep -q 'NoSuchLifecycleConfiguration' "$tmp_dir/get.log"; then
  printf '{"Rules": []}\n' > "$tmp_dir/current.json"
else
  echo "::group::Lifecycle configuration read error"
  sed -e 's/^/  /' "$tmp_dir/get.log" | head -c 4000
  echo "::endgroup::"
  fail "Could not read the current S3 lifecycle configuration; no changes were made."
fi

python3 - "$tmp_dir/current.json" "$tmp_dir/desired.json" <<'PY'
import json
import sys
from pathlib import Path

source = json.loads(Path(sys.argv[1]).read_text())
rules = source.get("Rules", [])
if not isinstance(rules, list):
    raise SystemExit("Current lifecycle configuration has an invalid Rules value.")

managed = {
    "dgfy-compliance-preflight-sweep-30d": "artifacts/repo/Sieitzz/dgfy-platform/workflow/compliance-preflight-sweep/",
    "dgfy-build-android-release-manual-30d": "artifacts/repo/Sieitzz/dgfy-platform/workflow/build-android-release-manual/",
    "dgfy-promotion-quality-gate-30d": "artifacts/repo/Sieitzz/dgfy-platform/workflow/promotion-quality-gate/",
}
managed_ids = set(managed)

def prefix_of(rule):
    filter_value = rule.get("Filter")
    if isinstance(filter_value, dict):
        return filter_value.get("Prefix", "")
    return rule.get("Prefix", "")

def is_enabled(rule):
    return rule.get("Status", "Enabled") == "Enabled"

kept = []
for rule in rules:
    if rule.get("ID") in managed_ids:
        continue
    prefix = prefix_of(rule)
    overlaps = [target for target in managed.values() if prefix.startswith(target) or target.startswith(prefix)]
    if overlaps and is_enabled(rule):
        expiration = rule.get("Expiration") or {}
        noncurrent = rule.get("NoncurrentVersionExpiration") or {}
        if expiration or noncurrent:
            raise SystemExit(
                f"Existing enabled lifecycle rule {rule.get('ID', '<unnamed>')} overlaps managed CI artifact prefixes; "
                "review it before applying the managed 30-day policy."
            )
    kept.append(rule)

for rule_id, prefix in managed.items():
    kept.append({
        "ID": rule_id,
        "Status": "Enabled",
        "Filter": {"Prefix": prefix},
        "Expiration": {"Days": 30},
        "NoncurrentVersionExpiration": {"NoncurrentDays": 30},
    })

desired = {key: value for key, value in source.items() if key != "Rules"}
desired["Rules"] = kept
Path(sys.argv[2]).write_text(json.dumps(desired, indent=2) + "\n")
PY

if [[ "$apply" != true ]]; then
  echo "Lifecycle configuration was read successfully. Preview only; no bucket changes were made."
  python3 - "$tmp_dir/desired.json" <<'PY'
import json
import sys
for rule in json.load(open(sys.argv[1]))["Rules"]:
    if rule.get("ID", "").startswith("dgfy-"):
        print(f"{rule['ID']}: {rule['Filter']['Prefix']} expires current and noncurrent objects after 30 days")
PY
  echo "Run with --apply to write and verify these three rules while preserving unrelated rules."
  exit 0
fi

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" --endpoint-url "$endpoint_url" \
  --lifecycle-configuration "file://$tmp_dir/desired.json" --no-cli-pager \
  >"$tmp_dir/put.log" 2>&1 || {
    echo "::group::Lifecycle configuration write error"
    sed -e 's/^/  /' "$tmp_dir/put.log" | head -c 4000
    echo "::endgroup::"
    fail "Could not apply the S3 lifecycle configuration."
  }

aws s3api get-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" --endpoint-url "$endpoint_url" --no-cli-pager \
  >"$tmp_dir/verified.json" 2>"$tmp_dir/verify.log" || {
    echo "::group::Lifecycle configuration verification error"
    sed -e 's/^/  /' "$tmp_dir/verify.log" | head -c 4000
    echo "::endgroup::"
    fail "Lifecycle configuration was written but could not be read back."
  }

python3 - "$tmp_dir/verified.json" <<'PY'
import json
import sys

rules = {rule.get("ID"): rule for rule in json.load(open(sys.argv[1])).get("Rules", [])}
expected = {
    "dgfy-compliance-preflight-sweep-30d": "artifacts/repo/Sieitzz/dgfy-platform/workflow/compliance-preflight-sweep/",
    "dgfy-build-android-release-manual-30d": "artifacts/repo/Sieitzz/dgfy-platform/workflow/build-android-release-manual/",
    "dgfy-promotion-quality-gate-30d": "artifacts/repo/Sieitzz/dgfy-platform/workflow/promotion-quality-gate/",
}
for rule_id, prefix in expected.items():
    rule = rules.get(rule_id)
    if not rule or rule.get("Status") != "Enabled":
        raise SystemExit(f"Lifecycle rule {rule_id} is missing or disabled after write.")
    filter_value = rule.get("Filter") or {}
    if filter_value.get("Prefix", rule.get("Prefix", "")) != prefix:
        raise SystemExit(f"Lifecycle rule {rule_id} has an unexpected prefix after write.")
    if (rule.get("Expiration") or {}).get("Days") != 30:
        raise SystemExit(f"Lifecycle rule {rule_id} has an unexpected current-object expiry.")
    if (rule.get("NoncurrentVersionExpiration") or {}).get("NoncurrentDays") != 30:
        raise SystemExit(f"Lifecycle rule {rule_id} has an unexpected noncurrent-version expiry.")

print("All three CI artifact lifecycle rules were read back and verified.")
PY
