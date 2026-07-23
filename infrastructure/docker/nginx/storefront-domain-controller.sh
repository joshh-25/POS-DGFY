#!/usr/bin/env bash
set -euo pipefail

: "${STOREFRONT_DOMAIN_CONTROLLER_API_URL:?Set STOREFRONT_DOMAIN_CONTROLLER_API_URL}"
: "${STOREFRONT_DOMAIN_CONTROLLER_TOKEN:?Set STOREFRONT_DOMAIN_CONTROLLER_TOKEN}"
: "${STOREFRONT_DOMAIN_CONTROLLER_ID:?Set STOREFRONT_DOMAIN_CONTROLLER_ID}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="${STOREFRONT_DOMAIN_CONTROLLER_API_URL%/}/api/v1/internal/storefront-domain-operations"
RUN_ONCE=0
if [[ "${1:-}" == "--once" ]]; then
  RUN_ONCE=1
fi

for dependency in curl jq; do
  command -v "$dependency" >/dev/null 2>&1 || {
    echo "Missing required controller dependency: $dependency" >&2
    exit 2
  }
done

api_post() {
  local url="$1"
  local payload="$2"
  curl --fail --silent --show-error \
    --request POST \
    --header "Authorization: Bearer $STOREFRONT_DOMAIN_CONTROLLER_TOKEN" \
    --header "X-Controller-Id: $STOREFRONT_DOMAIN_CONTROLLER_ID" \
    --header "Content-Type: application/json" \
    --data "$payload" \
    "$url"
}

report_failure() {
  local operation_id="$1"
  local error_code="$2"
  local error_message="$3"
  local payload
  payload="$(jq -n \
    --arg code "$error_code" \
    --arg message "$error_message" \
    '{success:false,error_code:$code,error_message:$message}')"
  api_post "$API_ROOT/$operation_id/result" "$payload" >/dev/null
}

certificate_expiry() {
  local domain="$1"
  local certificate="$SCRIPT_DIR/../data/certbot/conf/live/$domain/fullchain.pem"
  if [[ ! -f "$certificate" ]] || ! command -v openssl >/dev/null 2>&1; then
    return
  fi
  local raw
  raw="$(openssl x509 -enddate -noout -in "$certificate" 2>/dev/null | cut -d= -f2-)"
  if [[ -n "$raw" ]] && date -u -d "$raw" +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -d "$raw" +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

prove_canonical_health() {
  local hostname="$1"
  local tenant_id="$2"
  local context
  context="$(curl --fail --silent --show-error --max-time 20 "https://$hostname/api/v1/store/domain-context")"
  [[ "$(jq -r '.data.tenant_id // empty' <<<"$context")" == "$tenant_id" ]]
  [[ "$(jq -r '.data.routing_mode // empty' <<<"$context")" == "custom_domain" ]]
}

prove_alias_redirect() {
  local hostname="$1"
  local canonical_hostname="$2"
  local headers
  headers="$(curl --silent --show-error --head --max-time 20 "https://$hostname/")"
  grep -Eiq '^HTTP/[^ ]+ 30[18]' <<<"$headers"
  grep -Eiq "^location: https://$canonical_hostname/" <<<"$headers"
}

process_operation() {
  local lease_response="$1"
  local operation_id operation_type hostname tenant_id role canonical_hostname
  operation_id="$(jq -r '.data.operation.id' <<<"$lease_response")"
  operation_type="$(jq -r '.data.operation.operation_type' <<<"$lease_response")"
  hostname="$(jq -r '.data.domain.hostname' <<<"$lease_response")"
  tenant_id="$(jq -r '.data.domain.tenant_id' <<<"$lease_response")"
  role="$(jq -r '.data.domain.role' <<<"$lease_response")"
  canonical_hostname="$(jq -r '.data.domain.canonical_hostname' <<<"$lease_response")"

  local reference="controller:$STOREFRONT_DOMAIN_CONTROLLER_ID:$operation_id"
  local tls_expiry=""

  case "$operation_type" in
    provision|restore|renew)
      local args=()
      if [[ "${STOREFRONT_DOMAIN_ACME_STAGING:-false}" == "true" ]]; then
        args+=(--staging)
      fi
      if [[ "$role" == "alias" ]]; then
        args+=(--alias-of "$canonical_hostname")
      fi
      "$SCRIPT_DIR/provision-custom-storefront.sh" "${args[@]}" "$hostname"
      if [[ "$role" == "alias" ]]; then
        prove_alias_redirect "$hostname" "$canonical_hostname"
      else
        prove_canonical_health "$hostname" "$tenant_id"
      fi
      tls_expiry="$(certificate_expiry "$hostname")"
      ;;
    suspend)
      "$SCRIPT_DIR/deprovision-custom-storefront.sh" "$hostname"
      ;;
    remove)
      "$SCRIPT_DIR/deprovision-custom-storefront.sh" --remove-certificate "$hostname"
      ;;
    *)
      report_failure "$operation_id" "UNSUPPORTED_OPERATION" "Unsupported operation type."
      return
      ;;
  esac

  local result_payload
  result_payload="$(jq -n \
    --arg reference "$reference" \
    --arg expiry "$tls_expiry" \
    --arg operation "$operation_type" \
    '{
      success:true,
      health_check_passed:true,
      provisioning_reference:$reference,
      tls_expires_at:(if $expiry == "" then null else $expiry end),
      result:{operation:$operation}
    }')"
  api_post "$API_ROOT/$operation_id/result" "$result_payload" >/dev/null
}

while :; do
  lease="$(api_post "$API_ROOT/lease" '{"lease_seconds":120}')"
  operation_id="$(jq -r '.data.operation.id // empty' <<<"$lease")"
  if [[ -z "$operation_id" ]]; then
    if [[ "$RUN_ONCE" == "1" ]]; then
      exit 0
    fi
    sleep 10
    continue
  fi

  if ! process_operation "$lease"; then
    message="Controller execution failed for operation $operation_id."
    report_failure "$operation_id" "CONTROLLER_EXECUTION_FAILED" "$message" || true
  fi

  if [[ "$RUN_ONCE" == "1" ]]; then
    exit 0
  fi
done
