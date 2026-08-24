/**
 * Chrome 80-84 runtime-method polyfill for the iMin POS WebView fleet.
 *
 * The iMin terminal hardware ships a fixed Android WebView pinned to Chrome
 * 80-84 and cannot be updated in the field. Vite's `build.target: chrome80`
 * (all four vite.config.js files) downlevels *syntax* only -- it cannot and
 * does not add missing *runtime prototype methods*. That gap is exactly what
 * crashed production twice: #271 (String.prototype.replaceAll, Chrome 85+)
 * and #664 (Array.prototype.at, Chrome 92+).
 *
 * This file shims the specific methods known to be reachable today -- our
 * own code (#664) and third-party bundled dependencies we don't control:
 * maplibre-gl calls Object.hasOwn 5x internally (reachable from POS via the
 * lazy-loaded location/tenant-setup map screens), web-vitals /
 * @sentry/browser-utils's InteractionManager calls Array.prototype.at (kept
 * out of the hot path today by sentryClient.js's `enableInp: false`, but
 * shimming removes the dependency on that staying true forever), and
 * mdast-util-to-hast (a react-markdown dependency, reachable from
 * SKUpervisor's lazy-loaded AI Chat page) calls structuredClone, and
 * @radix-ui/react-collection (bundled transitively via @radix-ui/react-
 * accordion and @radix-ui/react-scroll-area, reachable from IMS's Items
 * page) calls Array.prototype.toSorted -- both caught live by
 * build/esCompatGuardPlugin.js (layer 2) on this guardrail's own first
 * build against the fully absorbed codebase (2026-08-22 develop absorb),
 * and promoted here rather than allowlisted around, since a shim actually
 * fixes the crash instead of just silencing the alarm.
 *
 * Every definition is feature-tested, so modern browsers pay nothing extra,
 * and installed non-enumerable so it never leaks into `for...in`/
 * `Object.keys` on Array.prototype/Object -- the same shape core-js uses for
 * spec-compliant polyfills, just hand-written to avoid a new dependency for
 * five methods.
 *
 * Scope limit: this only protects code reached through an app's ES module
 * graph. A `<script>` tag executed before the module graph, or the POS
 * offline-precache service worker (apps/pos/vitePosOfflinePrecachePlugin.js
 * patches sw.js at build time, but sw.js itself runs in its own worker
 * context, outside this import), are NOT covered. Neither currently uses any
 * shimmed method (confirmed during #666's investigation), but that is a
 * property to re-check, not a permanent guarantee.
 *
 * See ADR 0067 for the layered guardrail this is layer 1 of, and
 * build/esCompatGuardPlugin.js (layer 2) for the build-time backstop that
 * catches methods this file does NOT shim.
 */

if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function at(index) {
      const length = this.length >>> 0;
      let relativeIndex = Math.trunc(index) || 0;
      if (relativeIndex < 0) relativeIndex += length;
      if (relativeIndex < 0 || relativeIndex >= length) return undefined;
      return this[relativeIndex];
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

if (typeof String.prototype.at !== 'function') {
  Object.defineProperty(String.prototype, 'at', {
    value: function at(index) {
      const str = String(this);
      const length = str.length;
      let relativeIndex = Math.trunc(index) || 0;
      if (relativeIndex < 0) relativeIndex += length;
      if (relativeIndex < 0 || relativeIndex >= length) return undefined;
      return str[relativeIndex];
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: function hasOwn(target, property) {
      if (target == null) {
        throw new TypeError('Object.hasOwn called on null or undefined');
      }
      return Object.prototype.hasOwnProperty.call(Object(target), property);
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

if (typeof String.prototype.replaceAll !== 'function') {
  Object.defineProperty(String.prototype, 'replaceAll', {
    // Simplification vs. the full spec: a string replaceValue does not
    // expand `$&`/`$\``/`$'`/`$$` substitution patterns (split/join can't
    // express that). Not a real gap here -- .eslintrc.json's
    // no-restricted-syntax rule bans replaceAll outright in first-party
    // source (#271), so the only caller this can ever see is a bundled
    // dependency, and none in this repo pass a $-pattern replacement.
    value: function replaceAll(searchValue, replaceValue) {
      if (searchValue instanceof RegExp) {
        if (!searchValue.global) {
          throw new TypeError('replaceAll must be called with a global RegExp');
        }
        return String.prototype.replace.call(this, searchValue, replaceValue);
      }
      const str = String(this);
      const search = String(searchValue);
      if (typeof replaceValue === 'function') {
        let result = '';
        let position = 0;
        let index = str.indexOf(search, position);
        while (index !== -1) {
          result += str.slice(position, index) + String(replaceValue(search, index, str));
          position = index + (search.length || 1);
          index = str.indexOf(search, position);
        }
        return result + str.slice(position);
      }
      return str.split(search).join(replaceValue);
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

if (typeof Array.prototype.findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    value: function findLast(callback, thisArg) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (callback.call(thisArg, this[i], i, this)) return this[i];
      }
      return undefined;
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

if (typeof Array.prototype.findLastIndex !== 'function') {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function findLastIndex(callback, thisArg) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (callback.call(thisArg, this[i], i, this)) return i;
      }
      return -1;
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

if (typeof globalThis.structuredClone !== 'function') {
  // A reasonably complete fallback (not the full HTML structured-clone
  // algorithm -- no ArrayBuffer/TypedArray/Blob/File/ImageData support,
  // no transfer list) covering what this app's own reachable call site
  // (mdast-util-to-hast, cloning parsed markdown ASTs: plain objects,
  // arrays, strings, numbers, booleans, null) actually needs, plus the
  // common built-ins (Date, RegExp, Map, Set) and cycle support so it does
  // not misbehave silently outside that one call site.
  const cloneInternal = (value, seen) => {
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new DOMException('Could not be cloned.', 'DataCloneError');
    }
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);

    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof RegExp) return new RegExp(value.source, value.flags);

    if (Array.isArray(value)) {
      const clone = [];
      seen.set(value, clone);
      for (let i = 0; i < value.length; i++) clone[i] = cloneInternal(value[i], seen);
      return clone;
    }

    if (value instanceof Map) {
      const clone = new Map();
      seen.set(value, clone);
      value.forEach((v, k) => clone.set(cloneInternal(k, seen), cloneInternal(v, seen)));
      return clone;
    }

    if (value instanceof Set) {
      const clone = new Set();
      seen.set(value, clone);
      value.forEach((v) => clone.add(cloneInternal(v, seen)));
      return clone;
    }

    const clone = {};
    seen.set(value, clone);
    for (const key of Object.keys(value)) clone[key] = cloneInternal(value[key], seen);
    return clone;
  };

  Object.defineProperty(globalThis, 'structuredClone', {
    value: function structuredClone(value) {
      return cloneInternal(value, new Map());
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

if (typeof Array.prototype.toSorted !== 'function') {
  Object.defineProperty(Array.prototype, 'toSorted', {
    // Same sort semantics as Array.prototype.sort (default: convert to
    // string and compare UTF-16 code units), just applied to a copy so the
    // original array is left untouched, matching the spec.
    value: function toSorted(compareFn) {
      return this.slice().sort(compareFn);
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}
