#!/bin/sh
# Install runtime packages with a bounded fallback across official Alpine
# mirrors. Keep the CDN first, but do not make a transient package-index
# transport failure take down every image build.
set -eu

if [ "$#" -eq 0 ]; then
  echo "[apk] no packages were provided" >&2
  exit 2
fi

alpine_version="$(cut -d. -f1,2 /etc/alpine-release)"
repositories_backup="$(mktemp)"
trap 'rm -f "$repositories_backup"' EXIT
cp /etc/apk/repositories "$repositories_backup"

for mirror in \
  "https://dl-cdn.alpinelinux.org/alpine" \
  "https://mirror.leaseweb.com/alpine" \
  "https://mirrors.edge.kernel.org/alpine"
do
  printf '%s\n' \
    "$mirror/v${alpine_version}/main" \
    "$mirror/v${alpine_version}/community" \
    > /etc/apk/repositories

  echo "[apk] trying $mirror for Alpine v$alpine_version"
  if apk add --no-cache "$@"; then
    cp "$repositories_backup" /etc/apk/repositories
    exit 0
  fi
  echo "[apk] mirror failed: $mirror" >&2
done

cp "$repositories_backup" /etc/apk/repositories
echo "[apk] all configured HTTPS Alpine mirrors failed" >&2
exit 1
