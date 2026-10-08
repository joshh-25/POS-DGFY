#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "::error::$1" >&2
  exit 1
}

write_output() {
  local name="$1"
  local value="$2"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "Refusing multiline workflow output: $name"
  printf '%s=%s\n' "$name" "$value" >> "$GITHUB_OUTPUT"
}

if [[ "$#" -ne 2 ]]; then
  fail "Usage: ci-s3-upload.sh <local-file-path> <artifact-name>"
fi

source_file="$1"
artifact_name="$2"

if [[ ! -f "$source_file" ]]; then
  echo "::warning::S3 upload skipped because the evidence file is missing."
  write_output upload_status missing
  write_output artifact_name "$artifact_name"
  exit 0
fi

[[ -r "$source_file" ]] || fail "Evidence file is not readable."
[[ "$artifact_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Artifact name contains unsupported characters."
[[ -n "${AWS_ACCESS_KEY_ID:-}" ]] || fail "S3 access key ID is unavailable."
[[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]] || fail "S3 secret access key is unavailable."
[[ -n "${S3_BUCKET:-}" ]] || fail "S3 bucket setting is unavailable."
[[ -n "${GITHUB_OUTPUT:-}" && -n "${RUNNER_TEMP:-}" ]] || fail "Required GitHub Actions output or runner environment is unavailable."
[[ -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_WORKFLOW:-}" && -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_ATTEMPT:-}" && -n "${GITHUB_JOB:-}" ]] || fail "Required GitHub Actions run metadata is unavailable."

[[ "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "Repository metadata is malformed."
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || fail "Run metadata is malformed."
[[ "$GITHUB_JOB" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "Job metadata is malformed."

source_sha="${SOURCE_COMMIT_SHA:-${GITHUB_SHA:-}}"
[[ "$source_sha" =~ ^[0-9a-fA-F]{40,64}$ ]] || fail "Source commit SHA is unavailable or malformed."

key_prefix="${S3_KEY_PREFIX:-artifacts}"
[[ "$key_prefix" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && "$key_prefix" != *..* && "$key_prefix" != */ ]] || fail "S3 key prefix is malformed."

filename="$(basename "$source_file")"
[[ "$filename" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Evidence filename contains unsupported characters."

workflow_slug="$(printf '%s' "$GITHUB_WORKFLOW" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')"
[[ -n "$workflow_slug" ]] || fail "Workflow metadata is malformed."

endpoint_url="https://s3.patteruel.dev"
aws_region="${AWS_DEFAULT_REGION:-us-east-1}"
tmp_dir="$(mktemp -d "$RUNNER_TEMP/ci-s3-upload.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

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
  unzip -q "$tmp_dir/awscliv2.zip" -d "$install_root"
  "$install_root/aws/install" --install-dir "$install_root/aws-cli" --bin-dir "$bin_dir" >/dev/null
  aws_bin="$bin_dir/aws"
fi

"$aws_bin" --version >/dev/null

object_key="${key_prefix}/repo/${GITHUB_REPOSITORY}/workflow/${workflow_slug}/run/${GITHUB_RUN_ID}/attempt/${GITHUB_RUN_ATTEMPT}/job/${GITHUB_JOB}/artifact/${artifact_name}/sha/${source_sha}/${filename}"
object_uri="s3://${S3_BUCKET}/${object_key}"
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
  fail "S3 upload failed (AWS CLI exit code $rc)."
fi

if "$aws_bin" s3 cp "$object_uri" "$tmp_dir/direct-readback" \
  --endpoint-url "$endpoint_url" --only-show-errors --no-progress \
  >"$tmp_dir/download.log" 2>&1; then
  :
else
  rc=$?
  fail "S3 direct readback failed (AWS CLI exit code $rc)."
fi

direct_readback_sha256="$(sha256sum "$tmp_dir/direct-readback" | cut -d ' ' -f1)"
[[ "$direct_readback_sha256" == "$source_sha256" ]] || fail "S3 direct readback SHA-256 did not match the source."

if presigned_url="$("$aws_bin" s3 presign "$object_uri" --endpoint-url "$endpoint_url" --expires-in 172800 2>/dev/null)" && [[ -n "$presigned_url" ]]; then
  :
else
  fail "Could not create the 48-hour presigned retrieval URL."
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
