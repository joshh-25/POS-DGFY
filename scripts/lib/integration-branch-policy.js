'use strict';

// Shared contract for optional, reserved integration branch names. Keep this module dependency-
// free: the PR workflow reads its toggles before installing root dependencies.
const RESERVED_PREFIXES = Object.freeze(['epic', 'feature']);
const RESERVED_NAME_PATTERN = /^(epic|feature)\/(\d+)-([a-z0-9-]+)$/;
const RESERVED_HEAD_PREFIX_PATTERN = /^(epic|feature)\/\d+-/;

// Roll out the reservation check advisory-first. The first integration merge is a separate
// human-recorded milestone; only the reviewer uses that flag to authorize final-PR auto-merge.
const RESERVATION_CHECK_BLOCKING = false;
const FIRST_INTEGRATION_MERGE_RECORDED = false;
const STALENESS_WARNING_DAYS = 14;
const SYNC_CADENCE_DAYS = 7;

function isReservedName(name) {
  const value = String(name || '');
  return RESERVED_PREFIXES.some((prefix) => value.startsWith(`${prefix}/`));
}

function parseReservedName(name) {
  const match = RESERVED_NAME_PATTERN.exec(String(name || ''));
  if (!match) return null;
  return {
    prefix: match[1],
    issueNumber: Number(match[2]),
    slug: match[3],
  };
}

module.exports = {
  RESERVED_PREFIXES,
  RESERVED_NAME_PATTERN,
  RESERVED_HEAD_PREFIX_PATTERN,
  RESERVATION_CHECK_BLOCKING,
  FIRST_INTEGRATION_MERGE_RECORDED,
  STALENESS_WARNING_DAYS,
  SYNC_CADENCE_DAYS,
  isReservedName,
  parseReservedName,
};
