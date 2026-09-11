'use strict';

// #1819: the real migration now lives in packages/tenant-bootstrap (shared with apps/dgfy-api,
// which cannot reach into this sibling app inside its Docker image). This file stays here, at its
// original filename, purely so sequelize-cli's migrations-path scan and the SequelizeMeta rows
// already recorded against this filename on every existing tenant keep resolving identically --
// never rename or delete this shim. See packages/tenant-bootstrap/README.md.
module.exports = require('@sieitzz/tenant-bootstrap/migrations/20260824000001-create-pos-cashier-attendance-operator-sessions.cjs');
