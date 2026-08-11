package com.dgfy.standalonepos

/**
 * Bounded, TTL-expiring cache keyed by [K]. Backs [ReceiptLogoProvider]'s
 * success/failure memoization so repeated prints don't re-fetch or re-decode the
 * company icon on every single receipt, while a re-uploaded icon at the same URL
 * still refreshes within [ttlMs].
 *
 * Mirrors imin-wrapper's TtlLruCache.kt (see issue #321) -- this module and
 * imin-wrapper are separate Gradle projects with no shared module, so this is
 * duplicated rather than extracted, following this repo's existing pattern for
 * these two apps' near-identical BluetoothEscPosController.
 *
 * Deliberately Android-agnostic (no Bitmap/Context/SystemClock references) so it
 * can run under this module's plain JVM unit tests without Robolectric.
 * [clockMs] is injected for the same reason -- tests control time directly.
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
