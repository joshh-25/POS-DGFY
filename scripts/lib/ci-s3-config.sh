#!/usr/bin/env bash

ci_s3_endpoint_is_usable() {
  local endpoint_url="${1:-}"
  [[ -n "$endpoint_url" ]] || return 1
  command -v python3 >/dev/null 2>&1 || return 1

  python3 - "$endpoint_url" >/dev/null 2>&1 <<'PY'
import sys
from urllib.parse import urlsplit

raw = sys.argv[1]
try:
    parsed = urlsplit(raw)
    port = parsed.port
    valid = (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and parsed.username is None
        and parsed.password is None
        and "?" not in raw
        and "#" not in raw
        and (port is None or 1 <= port <= 65535)
        and not any(character.isspace() for character in raw)
    )
except ValueError:
    valid = False

raise SystemExit(0 if valid else 1)
PY
}
