package com.dgfy.iminwrapper

/**
 * Bounded, TTL-expiring cache keyed by [K]. Backs [ReceiptLogoProvider]'s
 * success/failure memoization so repeated prints (same shift, same tenant) don't
 * re-fetch or re-decode the company icon on every single receipt, while a
 * re-uploaded icon at the same URL still refreshes within [ttlMs] and a shared
 * terminal switching between companies doesn't grow this unbounded.
 *
 * Deliberately Android-agnostic (no Bitmap/Context/SystemClock references) so it can
 * run under this module's plain JVM unit tests -- see AppConfigTest for why: the
 * project has no Robolectric, so anything touching android.* throws under the stub
 * jar the test task compiles against. [clockMs] is injected for the same reason --
 * tests control time directly instead of sleeping real milliseconds.
 */
class TtlLruCache<K, V>(
    private val maxSize: Int,
    private val ttlMs: Long,
    private val clockMs: () -> Long
) {
    private data class Entry<V>(val value: V, val storedAtMs: Long)

    // Access-order LinkedHashMap gives LRU eviction for free via removeEldestEntry.
    private val entries = object : LinkedHashMap<K, Entry<V>>(maxSize, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, Entry<V>>?): Boolean {
            return size > maxSize
        }
    }

    @Synchronized
    fun get(key: K): V? {
        val entry = entries[key] ?: return null
        if (clockMs() - entry.storedAtMs > ttlMs) {
            entries.remove(key)
            return null
        }
        return entry.value
    }

    @Synchronized
    fun put(key: K, value: V) {
        entries[key] = Entry(value, clockMs())
    }

    @Synchronized
    fun size(): Int = entries.size
}
