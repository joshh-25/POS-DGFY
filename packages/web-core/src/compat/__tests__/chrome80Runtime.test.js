import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// This test suite deletes the native implementations before each test to
// exercise the shim path, exactly as it runs on a real Chrome 80-84 iMin
// device -- Node/modern-browser test runners already have every one of
// these methods natively, so importing the module normally would just
// no-op every guard and prove nothing.
const NATIVE = {
  arrayAt: Array.prototype.at,
  stringAt: String.prototype.at,
  objectHasOwn: Object.hasOwn,
  replaceAll: String.prototype.replaceAll,
  findLast: Array.prototype.findLast,
  findLastIndex: Array.prototype.findLastIndex,
  structuredClone: globalThis.structuredClone,
  toSorted: Array.prototype.toSorted
};

function deleteNatives() {
  delete Array.prototype.at;
  delete String.prototype.at;
  delete Object.hasOwn;
  delete String.prototype.replaceAll;
  delete Array.prototype.findLast;
  delete Array.prototype.findLastIndex;
  delete globalThis.structuredClone;
  delete Array.prototype.toSorted;
}

function restoreNatives() {
  Array.prototype.at = NATIVE.arrayAt;
  String.prototype.at = NATIVE.stringAt;
  Object.hasOwn = NATIVE.objectHasOwn;
  String.prototype.replaceAll = NATIVE.replaceAll;
  Array.prototype.findLast = NATIVE.findLast;
  Array.prototype.findLastIndex = NATIVE.findLastIndex;
  globalThis.structuredClone = NATIVE.structuredClone;
  Array.prototype.toSorted = NATIVE.toSorted;
}

describe('chrome80Runtime polyfill', () => {
  beforeEach(async () => {
    deleteNatives();
    vi.resetModules();
    await import('../chrome80Runtime.js');
  });

  afterEach(() => {
    restoreNatives();
  });

  describe('Array.prototype.at', () => {
    it('returns the element at a positive index', () => {
      expect([10, 20, 30].at(1)).toBe(20);
    });

    it('returns the element at a negative index', () => {
      expect([10, 20, 30].at(-1)).toBe(30);
    });

    it('returns undefined out of range', () => {
      expect([10, 20, 30].at(99)).toBeUndefined();
      expect([10, 20, 30].at(-99)).toBeUndefined();
    });

    it('returns undefined on an empty array', () => {
      expect([].at(-1)).toBeUndefined();
    });

    it('is installed non-enumerable (no for...in leakage)', () => {
      const keys = [];
      for (const key in []) keys.push(key);
      expect(keys).not.toContain('at');
      expect(Object.keys(Array.prototype)).not.toContain('at');
    });
  });

  describe('String.prototype.at', () => {
    it('returns the character at a positive and negative index', () => {
      expect('hello'.at(1)).toBe('e');
      expect('hello'.at(-1)).toBe('o');
    });

    it('returns undefined out of range', () => {
      expect('hello'.at(99)).toBeUndefined();
    });
  });

  describe('Object.hasOwn', () => {
    it('returns true for an own property', () => {
      expect(Object.hasOwn({ a: 1 }, 'a')).toBe(true);
    });

    it('returns false for an inherited property', () => {
      expect(Object.hasOwn({}, 'toString')).toBe(false);
    });

    it('returns false for a missing property', () => {
      expect(Object.hasOwn({ a: 1 }, 'b')).toBe(false);
    });

    it('throws on null/undefined target, matching the spec', () => {
      expect(() => Object.hasOwn(null, 'a')).toThrow(TypeError);
      expect(() => Object.hasOwn(undefined, 'a')).toThrow(TypeError);
    });

    it('is installed non-enumerable', () => {
      expect(Object.keys(Object)).not.toContain('hasOwn');
    });
  });

  describe('String.prototype.replaceAll', () => {
    it('replaces every occurrence with a string', () => {
      expect('a-b-c'.replaceAll('-', '_')).toBe('a_b_c');
    });

    it('replaces every occurrence via a function replacer', () => {
      let call = 0;
      const result = 'a-b-c'.replaceAll('-', () => `[${call++}]`);
      expect(result).toBe('a[0]b[1]c');
    });

    it('accepts a global RegExp', () => {
      expect('a1b2c3'.replaceAll(/\d/g, '#')).toBe('a#b#c#');
    });

    it('throws on a non-global RegExp, matching the spec', () => {
      expect(() => 'abc'.replaceAll(/a/, 'x')).toThrow(TypeError);
    });
  });

  describe('Array.prototype.findLast / findLastIndex', () => {
    it('findLast returns the last matching element', () => {
      expect([1, 2, 3, 4].findLast((n) => n % 2 === 0)).toBe(4);
    });

    it('findLast returns undefined when nothing matches', () => {
      expect([1, 3, 5].findLast((n) => n % 2 === 0)).toBeUndefined();
    });

    it('findLastIndex returns the last matching index', () => {
      expect([1, 2, 3, 4].findLastIndex((n) => n % 2 === 0)).toBe(3);
    });

    it('findLastIndex returns -1 when nothing matches', () => {
      expect([1, 3, 5].findLastIndex((n) => n % 2 === 0)).toBe(-1);
    });
  });

  describe('globalThis.structuredClone', () => {
    it('deep-clones plain objects and arrays', () => {
      const original = { a: 1, b: [1, 2, { c: 3 }] };
      const clone = structuredClone(original);
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.b).not.toBe(original.b);
      expect(clone.b[2]).not.toBe(original.b[2]);
    });

    it('clones Date, RegExp, Map, and Set', () => {
      const date = new Date('2026-08-18T00:00:00.000Z');
      const clonedDate = structuredClone(date);
      expect(clonedDate.getTime()).toBe(date.getTime());
      expect(clonedDate).not.toBe(date);

      const regex = /abc/gi;
      const clonedRegex = structuredClone(regex);
      expect(clonedRegex.source).toBe(regex.source);
      expect(clonedRegex.flags).toBe(regex.flags);

      const map = new Map([['a', 1]]);
      const clonedMap = structuredClone(map);
      expect(clonedMap.get('a')).toBe(1);
      expect(clonedMap).not.toBe(map);

      const set = new Set([1, 2, 3]);
      const clonedSet = structuredClone(set);
      expect([...clonedSet]).toEqual([1, 2, 3]);
      expect(clonedSet).not.toBe(set);
    });

    it('preserves object identity across a cycle', () => {
      const original = { name: 'root' };
      original.self = original;
      const clone = structuredClone(original);
      expect(clone.self).toBe(clone);
    });

    it('throws a DataCloneError on a function, matching the spec', () => {
      expect(() => structuredClone({ fn: () => {} })).toThrow();
    });
  });

  describe('Array.prototype.toSorted', () => {
    it('returns a new sorted array without mutating the original', () => {
      const original = [3, 1, 2];
      const sorted = original.toSorted();
      expect(sorted).toEqual([1, 2, 3]);
      expect(original).toEqual([3, 1, 2]);
      expect(sorted).not.toBe(original);
    });

    it('accepts a compare function, matching Array.prototype.sort semantics', () => {
      const sorted = [3, 1, 2].toSorted((a, b) => b - a);
      expect(sorted).toEqual([3, 2, 1]);
    });
  });

  describe('no-op on a platform that already has the natives', () => {
    it('does not throw or override when methods already exist', async () => {
      restoreNatives();
      vi.resetModules();
      await expect(import('../chrome80Runtime.js')).resolves.toBeDefined();
      expect([1, 2].at(-1)).toBe(2);
    });
  });
});
