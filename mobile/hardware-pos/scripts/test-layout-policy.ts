import assert from 'node:assert/strict';
import { resolvePosLayout } from '../src/app/layoutPolicy.ts';
import {
    getNextPosTextScale,
    normalizePosTextScale
} from '../src/domain/textScale.ts';

assert.deepEqual(resolvePosLayout(390, 844), {
    isTabletDevice: false,
    isTabletLayout: false,
    isCompactTablet: false,
    isLargeTablet: false,
    catalogColumns: 1
});

assert.deepEqual(resolvePosLayout(800, 1280), {
    isTabletDevice: true,
    isTabletLayout: true,
    isCompactTablet: true,
    isLargeTablet: false,
    catalogColumns: 2
});

assert.deepEqual(resolvePosLayout(600, 800), {
    isTabletDevice: true,
    isTabletLayout: false,
    isCompactTablet: true,
    isLargeTablet: false,
    catalogColumns: 2
});

assert.deepEqual(resolvePosLayout(800, 400), {
    isTabletDevice: false,
    isTabletLayout: false,
    isCompactTablet: false,
    isLargeTablet: false,
    catalogColumns: 1
});

assert.deepEqual(resolvePosLayout(1280, 800), {
    isTabletDevice: true,
    isTabletLayout: true,
    isCompactTablet: false,
    isLargeTablet: true,
    catalogColumns: 3
});

assert.equal(normalizePosTextScale(1.29), 1.3);
assert.equal(getNextPosTextScale(1), 1.15);
assert.equal(getNextPosTextScale(1.3), 1);

console.log('Native layout and text-scale policy tests passed.');
