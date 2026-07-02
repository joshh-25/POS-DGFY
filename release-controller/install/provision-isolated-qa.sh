#!/usr/bin/env bash
set -Eeuo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then APPLY=1; shift; fi
if [[ $# -ne 0 ]]; then echo "usage: $0 [--apply]" >&2; exit 2; fi

QA_UNIX_USER="${QA_UNIX_USER:-skupervisor-qa}"
PROD_UNIX_USER="${PROD_UNIX_USER:-}"
QA_ROOT="${QA_ROOT:-/srv/skupervisor-qa}"
QA_APP_DIR="${QA_APP_DIR:-${QA_ROOT}/app}"
PROD_APP_DIR="${PROD_APP_DIR:-}"
QA_UPLOADS_DIR="${QA_UPLOADS_DIR:-${QA_ROOT}/uploads}"
PROD_UPLOADS_DIR="${PROD_UPLOADS_DIR:-}"
QA_DATABASE_NAME="${QA_DATABASE_NAME:-skupervisor_qa}"
PROD_DATABASE_NAME="${PROD_DATABASE_NAME:-}"
QA_DB_USER="${QA_DB_USER:-skupervisor_qa}"
QA_DB_HOST="${QA_DB_HOST:-localhost}"
QA_PM2_NAMES="${QA_PM2_NAMES:-sku-qa-backend,sku-qa-ims,sku-qa-pos,sku-qa-store}"
PROD_PM2_NAMES="${PROD_PM2_NAMES:-}"
QA_REPOSITORY_URL="${QA_REPOSITORY_URL:-}"
QA_MYSQL_ADMIN_DEFAULTS_FILE="${QA_MYSQL_ADMIN_DEFAULTS_FILE:-/root/.my.cnf}"
QA_CONFIG_DIR="${QA_CONFIG_DIR:-/etc/skupervisor-qa}"

for name in "$QA_UNIX_USER" "$QA_DATABASE_NAME" "$QA_DB_USER"; do
  [[ "$name" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || { echo "[qa-provision] invalid identifier" >&2; exit 1; }
done
for required in PROD_UNIX_USER PROD_APP_DIR PROD_UPLOADS_DIR PROD_DATABASE_NAME PROD_PM2_NAMES QA_REPOSITORY_URL; do
  [[ -n "${!required}" ]] || { echo "[qa-provision] missing ${required}" >&2; exit 1; }
done

[[ "$QA_UNIX_USER" != "$PROD_UNIX_USER" ]] || { echo "[qa-provision] QA Unix user equals production" >&2; exit 1; }
[[ "${QA_APP_DIR%/}" != "${PROD_APP_DIR%/}" ]] || { echo "[qa-provision] QA app directory equals production" >&2; exit 1; }
[[ "${QA_UPLOADS_DIR%/}" != "${PROD_UPLOADS_DIR%/}" ]] || { echo "[qa-provision] QA uploads directory equals production" >&2; exit 1; }
[[ "$QA_DATABASE_NAME" != "$PROD_DATABASE_NAME" ]] || { echo "[qa-provision] QA database equals production" >&2; exit 1; }

IFS=',' read -r -a qa_pm2 <<< "$QA_PM2_NAMES"
IFS=',' read -r -a prod_pm2 <<< "$PROD_PM2_NAMES"
for qa_name in "${qa_pm2[@]}"; do
  [[ "$qa_name" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "[qa-provision] invalid QA PM2 name" >&2; exit 1; }
  for prod_name in "${prod_pm2[@]}"; do
    [[ "$qa_name" != "$prod_name" ]] || { echo "[qa-provision] QA PM2 name overlaps production" >&2; exit 1; }
  done
done

cat <<EOF
[qa-provision] mode=$([[ "$APPLY" == 1 ]] && echo apply || echo dry-run)
[qa-provision] unix_user=${QA_UNIX_USER}
[qa-provision] app_dir=${QA_APP_DIR}
[qa-provision] uploads_dir=${QA_UPLOADS_DIR}
[qa-provision] database_name=${QA_DATABASE_NAME}
[qa-provision] database_host=${QA_DB_HOST}
[qa-provision] pm2_names=${QA_PM2_NAMES}
[qa-provision] production_data_access=denied_by_separate_database_grant
EOF

if [[ "$APPLY" != 1 ]]; then
  echo "[qa-provision] dry run complete; no host state changed"
  exit 0
fi

[[ "$(id -u)" -eq 0 ]] || { echo "[qa-provision] --apply requires root" >&2; exit 1; }
[[ -f "$QA_MYSQL_ADMIN_DEFAULTS_FILE" ]] || { echo "[qa-provision] MySQL admin defaults file is missing" >&2; exit 1; }
[[ "$(stat -c '%a' "$QA_MYSQL_ADMIN_DEFAULTS_FILE")" =~ ^(600|400)$ ]] || { echo "[qa-provision] MySQL admin defaults file must be mode 0600 or 0400" >&2; exit 1; }

if ! id "$QA_UNIX_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$QA_ROOT" --shell /bin/bash "$QA_UNIX_USER"
fi
install -d -o root -g root -m 0700 "$QA_CONFIG_DIR"
install -d -o "$QA_UNIX_USER" -g "$QA_UNIX_USER" -m 0750 "$QA_ROOT" "$QA_APP_DIR" "$QA_UPLOADS_DIR"

if [[ ! -d "${QA_APP_DIR}/.git" ]]; then
  runuser -u "$QA_UNIX_USER" -- git clone --no-checkout "$QA_REPOSITORY_URL" "$QA_APP_DIR"
fi

QA_DB_PASSWORD="$(openssl rand -hex 32)"
QA_RUNTIME_MARKER="qa-runtime-$(openssl rand -hex 16)"
QA_DATABASE_MARKER="qa-database-$(openssl rand -hex 16)"
QA_TENANT_DATA_MARKER="qa-disposable-$(openssl rand -hex 16)"
QA_DB_CREDENTIAL_ID="qa-db-credential-$(openssl rand -hex 8)"

mysql --defaults-extra-file="$QA_MYSQL_ADMIN_DEFAULTS_FILE" <<SQL
CREATE DATABASE IF NOT EXISTS \`${QA_DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${QA_DB_USER}'@'localhost' IDENTIFIED BY '${QA_DB_PASSWORD}';
ALTER USER '${QA_DB_USER}'@'localhost' IDENTIFIED BY '${QA_DB_PASSWORD}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${QA_DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${QA_DATABASE_NAME}\`.* TO '${QA_DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

umask 077
cat > "${QA_CONFIG_DIR}/qa.env" <<EOF
NODE_ENV=qa
DB_HOST=${QA_DB_HOST}
DB_NAME=${QA_DATABASE_NAME}
DB_USER=${QA_DB_USER}
DB_PASSWORD=${QA_DB_PASSWORD}
QA_RUNTIME_MARKER=${QA_RUNTIME_MARKER}
QA_DATABASE_MARKER=${QA_DATABASE_MARKER}
QA_TENANT_DATA_MARKER=${QA_TENANT_DATA_MARKER}
QA_DB_CREDENTIAL_ID=${QA_DB_CREDENTIAL_ID}
QA_UPLOADS_DIR=${QA_UPLOADS_DIR}
QA_PM2_NAMES=${QA_PM2_NAMES}
QA_DISPOSABLE_TEST_DATA=1
QA_PRODUCTION_DATA_ACCESS=denied
EOF
chown root:root "${QA_CONFIG_DIR}/qa.env"
chmod 0600 "${QA_CONFIG_DIR}/qa.env"

echo "[qa-provision] apply complete; generated secrets were written only to ${QA_CONFIG_DIR}/qa.env"
