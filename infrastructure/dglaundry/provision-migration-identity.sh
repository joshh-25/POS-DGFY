#!/usr/bin/env bash
# One-time (idempotent, safe to re-run) provisioning of DGLaundry's dedicated,
# schema-scoped MySQL migration identity -- see Sieitzz/dglaundry's own
# infrastructure/docker/MIGRATION_IDENTITY.md for why this account must be
# separate from the runtime app user and must never carry SUPER, FILE,
# unrestricted PROCESS, or GRANT OPTION.
#
# Username/password/schema are never hardcoded here -- they're parsed from
# the already-decrypted mysql_migration_url secret file (written by
# deploy-sops.sh) so this script can never drift out of sync with whatever
# credential that secret actually carries. The MySQL root password is read
# from INSIDE the mysql container, via its own already-mounted
# mysql_root_password secret -- never passed as a CLI arg or env var on this
# host's own process list, matching publish-platform.yml's existing "never
# argv/env on the remote host" rule for the GHCR token.
#
# Usage: ./provision-migration-identity.sh <release-dir> <secrets-dir> <env-file>
set -euo pipefail

RELEASE_DIR="${1:?Usage: $0 <release-dir> <secrets-dir> <env-file>}"
SECRETS_DIR="${2:?Usage: $0 <release-dir> <secrets-dir> <env-file>}"
ENV_FILE="${3:?Usage: $0 <release-dir> <secrets-dir> <env-file>}"

MIGRATION_URL_FILE="$SECRETS_DIR/mysql_migration_url"
[ -f "$MIGRATION_URL_FILE" ] || { echo "Missing $MIGRATION_URL_FILE -- run deploy-sops.sh first" >&2; exit 1; }

MIGRATION_URL="$(cat "$MIGRATION_URL_FILE")"

# Parse mysql://user:pass@host:port/db -- deliberately not printed, not even
# to a trace log (no `set -x` anywhere in this script).
if [[ "$MIGRATION_URL" =~ ^mysql://([^:]+):([^@]+)@[^/]+/([A-Za-z0-9_]+) ]]; then
  MIG_USER="${BASH_REMATCH[1]}"
  MIG_PASS="${BASH_REMATCH[2]}"
  MIG_SCHEMA="${BASH_REMATCH[3]}"
else
  echo "::error::mysql_migration_url does not match the expected mysql://user:pass@host:port/db shape" >&2
  exit 1
fi

# SQL identifiers (user, schema) are regex-constrained above to [A-Za-z0-9_],
# so no further escaping is needed for them; only the password needs
# escaping for the SQL string literal. Backslash MUST be escaped before
# quotes, not after: under MySQL's default (non-ANSI) sql_mode, backslash is
# itself the string-literal escape character, so an unescaped backslash in
# the password could swallow a following quote or corrupt the literal
# (PR #2448 review, RF-3).
#
# The quote-doubling step deliberately holds the quote character in a
# variable ($q) rather than writing \' directly in the pattern/replacement:
# `${v//\'/\'\'}` looks like it doubles a quote but does not -- bash leaves
# the backslashes in the *replacement* text literal (pattern-side backslash
# is consumed, replacement-side is not), so that form actually turns each
# `'` into the 4-byte sequence `\'\'`, not `''` -- confirmed with `xxd`
# while fixing RF-3. Using $q for both pattern and replacement sidesteps
# the ambiguity entirely.
q="'"
MIG_PASS_ESCAPED="${MIG_PASS//\\/\\\\}"
MIG_PASS_ESCAPED="${MIG_PASS_ESCAPED//$q/$q$q}"

SQL_TMP_FILE="$(mktemp "${RELEASE_DIR}/.provision-migration.XXXXXX.sql")"
chmod 600 "$SQL_TMP_FILE"
trap 'rm -f "$SQL_TMP_FILE"' EXIT

cat > "$SQL_TMP_FILE" <<SQL
CREATE USER IF NOT EXISTS '${MIG_USER}'@'%' IDENTIFIED BY '${MIG_PASS_ESCAPED}';
ALTER USER '${MIG_USER}'@'%' IDENTIFIED BY '${MIG_PASS_ESCAPED}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON \`${MIG_SCHEMA}\`.* TO '${MIG_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "== provisioning migration identity '${MIG_USER}'@'%' scoped to \`${MIG_SCHEMA}\` =="

cd "$RELEASE_DIR"
# Only docker-compose.production.yml -- no surebizcorp-lean.yml overlay, see
# remote-deploy.sh's header comment for why (PR #2448 review, RF-2).
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.production.yml)

# Root password never leaves the mysql container -- read from its own
# already-mounted secret file (mysql service's compose secrets already
# include mysql_root_password), never passed in on this host's command line.
"${COMPOSE[@]}" exec -T mysql sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" exec mysql -uroot' \
  < "$SQL_TMP_FILE"

echo "== migration identity provisioned (idempotent -- safe to re-run) =="
