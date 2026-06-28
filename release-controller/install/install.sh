#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[release-controller-install] must run as root" >&2
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '\r\n' < "${SOURCE_DIR}/VERSION")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "[release-controller-install] invalid VERSION: ${VERSION}" >&2
  exit 1
fi

INSTALL_ROOT="${RELEASE_CONTROLLER_INSTALL_ROOT:-/opt/skupervisor-release-controller}"
STATE_ROOT="${RELEASE_CONTROLLER_STATE_ROOT:-/var/lib/skupervisor-release-controller}"
CONFIG_ROOT="${RELEASE_CONTROLLER_CONFIG_ROOT:-/etc/skupervisor-release-controller}"
RELEASE_DIR="${INSTALL_ROOT}/releases/${VERSION}"

if [[ -e "$RELEASE_DIR" ]]; then
  echo "[release-controller-install] version already installed: ${RELEASE_DIR}" >&2
  exit 1
fi

install -d -o root -g root -m 0755 "${INSTALL_ROOT}/releases"
install -d -o root -g root -m 0700 "$STATE_ROOT" "${STATE_ROOT}/nonce-ledger" "${STATE_ROOT}/worktrees"
install -d -o root -g root -m 0700 "$CONFIG_ROOT" "${CONFIG_ROOT}/secrets" "${CONFIG_ROOT}/gnupg"
install -d -o root -g root -m 0755 "$RELEASE_DIR"
cp -a "${SOURCE_DIR}/." "$RELEASE_DIR/"
chown -R root:root "$RELEASE_DIR"
find "$RELEASE_DIR" -type d -exec chmod 0755 {} +
find "$RELEASE_DIR" -type f -exec chmod 0644 {} +
chmod 0755 "${RELEASE_DIR}/bin/skupervisor-release-controller.js" "${RELEASE_DIR}/install/install.sh"
ln -sfn "${RELEASE_DIR}" "${INSTALL_ROOT}/current"

if [[ ! -e "${CONFIG_ROOT}/controller.json" ]]; then
  install -o root -g root -m 0600 "${SOURCE_DIR}/config/controller.example.json" "${CONFIG_ROOT}/controller.json"
fi

cat <<EOF
[release-controller-install] installed version ${VERSION}
[release-controller-install] executable: ${INSTALL_ROOT}/current/bin/skupervisor-release-controller.js
[release-controller-install] config: ${CONFIG_ROOT}/controller.json
[release-controller-install] import allowlisted public keys into ${CONFIG_ROOT}/gnupg out of band
EOF
