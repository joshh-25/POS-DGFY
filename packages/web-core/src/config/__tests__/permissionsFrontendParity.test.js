// #673: permissions_frontend.js is a hand-maintained mirror of apps/dgfy-api/src/config/permissions.js
// (the fallback path only -- see the comment atop permissions_frontend.js). This file had drifted
// independently more than once (missing groups, a misplaced action, mismatched key names, and a dead
// second export that itself fell out of sync). This suite is the standing drift guard: whoever changes
// either copy must update both together and keep this suite green, per ADR 0032's parity-test
// convention for exactly this "duplicate vs shared package" dilemma.
//
// The cross-app import below is test-only and outside Vite's build graph -- it does not reintroduce
// the Docker-build-context coupling ADR 0032 rejected for production runtime code sharing.
// apps/dgfy-api/src/config/permissions.js has zero external dependencies of its own (a pure object
// literal plus two helpers), so this is a plain filesystem ESM import, safe at test-time.

import { describe, it, expect } from 'vitest';
import { PERMISSION_GROUPS } from '../permissions_frontend.js';
import { PERMISSIONS as BACKEND_PERMISSIONS } from '../../../../../apps/dgfy-api/src/config/permissions.js';

const sortedEntries = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));

describe('#673 permissions_frontend.js parity with apps/dgfy-api/src/config/permissions.js', () => {
    const backendGroupKeys = Object.keys(BACKEND_PERMISSIONS);
    const frontendGroupKeys = Object.keys(PERMISSION_GROUPS);

    it('has a frontend group for every backend group', () => {
        expect(frontendGroupKeys.sort()).toEqual(backendGroupKeys.sort());
    });

    it.each(backendGroupKeys)('group %s matches the backend exactly (label + actions)', (groupKey) => {
        const backendGroup = BACKEND_PERMISSIONS[groupKey];
        const frontendGroup = PERMISSION_GROUPS[groupKey];

        expect(frontendGroup, `frontend is missing group ${groupKey}`).toBeDefined();
        expect(frontendGroup.label).toBe(backendGroup.label);

        // Compare [actionKey, value] pairs, not just values -- a renamed key with the same value
        // (the old VIEW_STOCK -> VIEW_MOVEMENTS case) must still fail this check.
        expect(sortedEntries(frontendGroup.permissions || {})).toEqual(
            sortedEntries(backendGroup.actions || {})
        );
    });

    it('has no frontend-only group not present on the backend', () => {
        const extra = frontendGroupKeys.filter((key) => !backendGroupKeys.includes(key));
        expect(extra).toEqual([]);
    });
});
