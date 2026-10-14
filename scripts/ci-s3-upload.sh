#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "::error::$1" >&2
  exit 1
}

source "$(dirname "${BASH_SOURCE[0]}")/lib/ci-s3-config.sh"

aws_failure_reason() {
  local log_file="$1"
  local error_code

  error_code="$(sed -nE 's/.*An error occurred \(([^)]+)\) when calling .*/\1/p' "$log_file" | head -n1)"
  if [[ "$error_code" =~ ^[A-Za-z0-9]+$ ]]; then
    printf 'S3 service error %s' "$error_code"
  elif grep -Eqi 'Could not connect to the endpoint URL|Connect timeout|Connection timed out|Connection refused' "$log_file"; then
    printf 'S3 endpoint connection failed'
  elif grep -Eqi 'SSL validation failed|certificate verify failed|SSL: CERTIFICATE_VERIFY_FAILED' "$log_file"; then
    printf 'S3 endpoint TLS validation failed'
  else
    printf 'unclassified S3 client error'
  fi
}

fail_aws_operation() {
  local operation="$1"
  local log_file="$2"
  local exit_code="$3"
  local reason

  reason="$(aws_failure_reason "$log_file")"
  # Share only the allowlisted classification with later workflow steps. Preserve the original AWS
  # failure if GitHub's output file is unavailable or cannot be written.
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    if ! write_output failure_reason "$reason"; then
      echo "::warning::Could not write the sanitized S3 failure reason to the GitHub Actions output file." >&2
    fi
  fi
  # The AWS CLI's non-debug error output for a failed S3 call never includes credential material
  # -- only the request URL, HTTP status, and the service's response body -- so printing it is
  # safe and gives the real error code/message instead of just the generic classification above.
  echo "::group::Raw AWS CLI error output for: $operation"
  sed -e 's/^/  /' "$log_file" | head -c 4000
  echo "::endgroup::"
  fail "$operation failed ($reason; AWS CLI exit code $exit_code). Check the configured S3 endpoint, bucket, and credential permissions."
}

write_output() {
  local name="$1"
  local value="$2"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "Refusing multiline workflow output: $name"
  printf '%s=%s\n' "$name" "$value" >> "$GITHUB_OUTPUT"
}

run_s3_readback_diagnostics() {
  local s3api_exit_code="$1"
  local s3api_log_file="$2"
  local cli_version
  local s3api_failure_reason
  local presigned_status='presign_failed'
  local presigned_http_status='000'
  local presigned_failure_reason=''
  local presigned_sha256=''
  local presigned_url=''
  local curl_exit_code=0

  s3api_failure_reason="$(aws_failure_reason "$s3api_log_file")"
  cli_version="$("$aws_bin" --version 2>&1 | head -n1 | tr -d '\r')"
  cli_version="${cli_version%% *}"
  if [[ ! "$cli_version" =~ ^aws-cli/[0-9]+(\.[0-9]+)*$ ]]; then
    cli_version='unavailable'
  fi

  if presigned_url="$("$aws_bin" s3 presign "$object_uri" --endpoint-url "$endpoint_url" --expires-in 300 2>"$tmp_dir/diagnostic-presign.log")" && [[ -n "$presigned_url" ]]; then
    presigned_status='request_failed'
    if presigned_http_status="$(curl --connect-timeout 15 --max-time 60 --silent --show-error \
      --output "$tmp_dir/presigned-readback-diagnostic" --write-out '%{http_code}' \
      "$presigned_url" 2>"$tmp_dir/presigned-curl.log")"; then
      if [[ "$presigned_http_status" == '200' && -f "$tmp_dir/presigned-readback-diagnostic" ]]; then
        presigned_sha256="$(sha256sum "$tmp_dir/presigned-readback-diagnostic" | cut -d ' ' -f1)"
        if [[ "$presigned_sha256" == "$source_sha256" ]]; then
          presigned_status='verified'
        else
          presigned_status='checksum_mismatch'
        fi
      else
        if [[ "$presigned_http_status" == '200' ]]; then
          presigned_status='missing_output'
        else
          presigned_status='http_failure'
        fi
      fi
    else
      curl_exit_code=$?
      presigned_http_status='000'
      presigned_failure_reason="curl request failed (exit code $curl_exit_code)"
    fi
  else
    presigned_status='presign_failed'
    presigned_failure_reason="$(aws_failure_reason "$tmp_dir/diagnostic-presign.log")"
  fi

  echo "::group::S3 readback diagnostics"
  echo "AWS CLI version: $cli_version"
  echo "s3api GetObject: failed ($s3api_failure_reason; exit code $s3api_exit_code)"
  echo "Presigned GET: $presigned_status (HTTP $presigned_http_status)${presigned_failure_reason:+; $presigned_failure_reason}${presigned_sha256:+; SHA-256 $presigned_sha256}"
  echo "::endgroup::"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    local s3api_details="failed ($s3api_failure_reason; exit code $s3api_exit_code)"
    local presigned_details="$presigned_status (HTTP $presigned_http_status)"
    [[ -z "$presigned_failure_reason" ]] || presigned_details+="; $presigned_failure_reason"
    [[ -z "$presigned_sha256" ]] || presigned_details+="; SHA-256 $presigned_sha256"
    if ! {
      printf '\n### S3 readback diagnostics\n\n'
      printf -- '- AWS CLI version: `%s`.\n' "$cli_version"
      printf -- '- `s3api GetObject`: %s.\n' "$s3api_details"
      printf -- '- Presigned GET: %s.\n' "$presigned_details"
      printf -- '- Presigned URL omitted.\n'
    } >>"$GITHUB_STEP_SUMMARY"; then
      echo "::warning::Could not append S3 readback diagnostics to the GitHub Actions step summary." >&2
    fi
  fi
}

if [[ "$#" -ne 2 ]]; then
  fail "Usage: ci-s3-upload.sh <local-file-or-directory-path> <artifact-name>"
fi

source_path="$1"
artifact_name="$2"

endpoint_url="${ARTIFACT_S3_ENDPOINT:-}"
[[ -n "$endpoint_url" ]] || fail "S3 endpoint setting is unavailable."
command -v python3 >/dev/null 2>&1 || fail "Python 3 is required to validate the S3 endpoint."
ci_s3_endpoint_is_usable "$endpoint_url" || fail "S3 endpoint must be a valid HTTPS URL without credentials, query tokens, or a fragment."

if [[ ! -f "$source_path" && ! -d "$source_path" ]]; then
  echo "::warning::S3 upload skipped because the evidence file is missing."
  write_output upload_status missing
  write_output artifact_name "$artifact_name"
  exit 0
fi

[[ -r "$source_path" ]] || fail "Evidence input is not readable."
[[ "$artifact_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Artifact name contains unsupported characters."
[[ -n "${ARTIFACT_S3_ACCESS_KEY_ID:-}" ]] || fail "S3 access key ID is unavailable."
[[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]] || fail "S3 secret access key is unavailable."
[[ -n "${ARTIFACT_S3_BUCKET:-}" ]] || fail "S3 bucket setting is unavailable."
[[ -n "${GITHUB_OUTPUT:-}" && -n "${RUNNER_TEMP:-}" ]] || fail "Required GitHub Actions output or runner environment is unavailable."
[[ -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_WORKFLOW:-}" && -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_ATTEMPT:-}" && -n "${GITHUB_JOB:-}" ]] || fail "Required GitHub Actions run metadata is unavailable."

[[ "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "Repository metadata is malformed."
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || fail "Run metadata is malformed."
[[ "$GITHUB_JOB" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "Job metadata is malformed."

source_sha="${SOURCE_COMMIT_SHA:-${GITHUB_SHA:-}}"
[[ "$source_sha" =~ ^[0-9a-fA-F]{40,64}$ ]] || fail "Source commit SHA is unavailable or malformed."

key_prefix="${S3_KEY_PREFIX:-artifacts}"
[[ "$key_prefix" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && "$key_prefix" != *..* && "$key_prefix" != */ ]] || fail "S3 key prefix is malformed."

tmp_dir="$(mktemp -d "$RUNNER_TEMP/ci-s3-upload.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

if [[ -d "$source_path" ]]; then
  command -v tar >/dev/null 2>&1 || fail "tar is required to package directory evidence."
  source_dir_name="$(basename "$source_path")"
  [[ "$source_dir_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Evidence directory name contains unsupported characters."
  source_file="$tmp_dir/${source_dir_name}.tar.gz"
  if ! tar -czf "$source_file" -C "$(dirname "$source_path")" "$source_dir_name" 2>"$tmp_dir/archive.log"; then
    fail "Could not package directory evidence."
  fi
else
  source_file="$source_path"
fi

filename="$(basename "$source_file")"
[[ "$filename" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Evidence filename contains unsupported characters."

workflow_slug="$(printf '%s' "$GITHUB_WORKFLOW" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')"
[[ -n "$workflow_slug" ]] || fail "Workflow metadata is malformed."

aws_region="${AWS_DEFAULT_REGION:-us-east-1}"
export AWS_ACCESS_KEY_ID="$ARTIFACT_S3_ACCESS_KEY_ID"

# Isolate the CLI from persistent self-hosted runner credentials/configuration. This temporary
# config contains no credentials and fixes the path-style and multipart behavior for SeaweedFS.
export AWS_CONFIG_FILE="$tmp_dir/aws-config"
export AWS_SHARED_CREDENTIALS_FILE="$tmp_dir/aws-credentials"
export AWS_EC2_METADATA_DISABLED=true
export AWS_DEFAULT_REGION="$aws_region"
unset AWS_PROFILE || true
cat > "$AWS_CONFIG_FILE" <<AWS_CONFIG
[default]
region = $aws_region
s3 =
    addressing_style = path
    multipart_threshold = 8MB
AWS_CONFIG

aws_bin=""
if command -v aws >/dev/null 2>&1 && aws --version 2>&1 | grep -q '^aws-cli/2\.'; then
  aws_bin="$(command -v aws)"
else
  case "$(uname -m)" in
    x86_64) aws_arch="x86_64" ;;
    aarch64|arm64) aws_arch="aarch64" ;;
    *) fail "Runner architecture is unsupported by the AWS CLI v2 installer." ;;
  esac

  install_root="$tmp_dir/aws-cli-install"
  bin_dir="$tmp_dir/aws-cli-bin"
  mkdir -p "$install_root" "$bin_dir"
  curl --fail --silent --show-error \
    "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip" \
    --output "$tmp_dir/awscliv2.zip"
  # Persistent self-hosted runners may not have the `unzip` package installed. Use Python's
  # standard library to extract the official bundle without needing root or changing the runner.
  command -v python3 >/dev/null 2>&1 || fail "Python 3 is required to unpack the AWS CLI installer bundle."
  python3 - "$tmp_dir/awscliv2.zip" "$install_root" <<'PY'
import os
from pathlib import Path
import stat
import sys
from zipfile import ZipFile

archive_path = Path(sys.argv[1])
destination = Path(sys.argv[2]).resolve()

with ZipFile(archive_path) as archive:
    for member in archive.infolist():
        target = (destination / member.filename).resolve()
        if target != destination and destination not in target.parents:
            raise SystemExit(f"Unsafe path in AWS CLI installer archive: {member.filename}")
        archive.extract(member, destination)
        mode = (member.external_attr >> 16) & 0o777
        if mode and stat.S_ISREG(member.external_attr >> 16):
            os.chmod(target, mode)
PY
  "$install_root/aws/install" --install-dir "$install_root/aws-cli" --bin-dir "$bin_dir" >/dev/null
  aws_bin="$bin_dir/aws"
fi

"$aws_bin" --version >/dev/null

object_key="${key_prefix}/repo/${GITHUB_REPOSITORY}/workflow/${workflow_slug}/run/${GITHUB_RUN_ID}/attempt/${GITHUB_RUN_ATTEMPT}/job/${GITHUB_JOB}/artifact/${artifact_name}/sha/${source_sha}/${filename}"
object_uri="s3://${ARTIFACT_S3_BUCKET}/${object_key}"
source_sha256="$(sha256sum "$source_file" | cut -d ' ' -f1)"
size_bytes="$(wc -c < "$source_file" | tr -d '[:space:]')"
[[ "$size_bytes" =~ ^[0-9]+$ ]] || fail "Could not determine evidence file size."

# These outputs are consumed by the workflow summary step. Do not print credential values or the
# signed retrieval URL to standard output or standard error.
write_output object_key "$object_key"
write_output object_uri "$object_uri"
write_output artifact_name "$artifact_name"
write_output size_bytes "$size_bytes"
write_output source_sha256 "$source_sha256"

if "$aws_bin" s3 cp "$source_file" "$object_uri" \
  --endpoint-url "$endpoint_url" --only-show-errors --no-progress \
  >"$tmp_dir/upload.log" 2>&1; then
  :
else
  rc=$?
  fail_aws_operation "S3 upload" "$tmp_dir/upload.log" "$rc"
fi

# Retry (#2329): a 100MB+ multipart-completed object previously returned a 403 on the immediate
# HeadObject issued internally by `aws s3 cp` before download --
# https://github.com/Sieitzz/dgfy-platform/actions/runs/37754268626. Keep bounded backoff around
# direct GetObject to distinguish SeaweedFS multipart visibility delays from a persistent failure.
readback_attempt=1
readback_max_attempts=5
while true; do
  # Run 38567225921 showed `aws s3 cp` readback failing with SignatureDoesNotMatch while this direct
  # GetObject API call and the presigned GET both verified the same source checksum. Use the
  # explicit API operation for evidence verification instead of the failing transfer-manager path.
  if "$aws_bin" s3api get-object \
    --bucket "$ARTIFACT_S3_BUCKET" --key "$object_key" "$tmp_dir/direct-readback" \
    --endpoint-url "$endpoint_url" --cli-connect-timeout 15 --cli-read-timeout 60 \
    >"$tmp_dir/download.log" 2>&1; then
    break
  else
    rc=$?
  fi
  if (( readback_attempt >= readback_max_attempts )); then
    if [[ "${S3_DIAGNOSE_READBACK_FAILURE:-false}" == 'true' ]]; then
      run_s3_readback_diagnostics "$rc" "$tmp_dir/download.log"
    fi
    fail_aws_operation "S3 direct readback" "$tmp_dir/download.log" "$rc"
  fi
  echo "::warning::S3 direct readback attempt $readback_attempt/$readback_max_attempts failed ($(aws_failure_reason "$tmp_dir/download.log")); retrying after $((readback_attempt * 10))s."
  sleep "$((readback_attempt * 10))"
  readback_attempt=$((readback_attempt + 1))
done

direct_readback_sha256="$(sha256sum "$tmp_dir/direct-readback" | cut -d ' ' -f1)"
[[ "$direct_readback_sha256" == "$source_sha256" ]] || fail "S3 direct readback SHA-256 did not match the source."

if presigned_url="$("$aws_bin" s3 presign "$object_uri" --endpoint-url "$endpoint_url" --expires-in 172800 2>"$tmp_dir/presign.log")" && [[ -n "$presigned_url" ]]; then
  :
else
  fail_aws_operation "Presigned URL creation" "$tmp_dir/presign.log" "$?"
fi

if presigned_http_status="$(curl --fail --silent --show-error \
  --output "$tmp_dir/presigned-readback" --write-out '%{http_code}' "$presigned_url" 2>/dev/null)"; then
  :
else
  fail "Presigned URL readback failed (HTTP status ${presigned_http_status:-unavailable})."
fi
[[ "$presigned_http_status" == "200" ]] || fail "Presigned URL returned an unexpected HTTP status."

presigned_readback_sha256="$(sha256sum "$tmp_dir/presigned-readback" | cut -d ' ' -f1)"
[[ "$presigned_readback_sha256" == "$source_sha256" ]] || fail "Presigned readback SHA-256 did not match the source."

write_output direct_readback_sha256 "$direct_readback_sha256"
write_output presigned_readback_sha256 "$presigned_readback_sha256"
write_output presigned_http_status "$presigned_http_status"
write_output presigned_url "$presigned_url"
if [[ "${S3_DELETE_AFTER_VERIFY:-false}" == "true" ]]; then
  if "$aws_bin" s3 rm "$object_uri" --endpoint-url "$endpoint_url" --only-show-errors >"$tmp_dir/delete.log" 2>&1; then
    write_output cleanup_status removed
  else
    rc=$?
    fail "Verified S3 object cleanup failed (AWS CLI exit code $rc)."
  fi
else
  write_output cleanup_status retained
fi
write_output upload_status verified
echo "S3 evidence upload and both checksum readbacks verified (size ${size_bytes} bytes; SHA-256 ${source_sha256})."
