import { resolveAppAssetUrl } from '../../../utils/assetUrl.js';
import {
  safeLocalStorageGet,
  safeLocalStorageSet
} from './posTerminalStorage.js';
import {
  playOrderAlertWithIminBridge,
  saveOrderAlertSoundWithIminBridge,
  stopOrderAlertWithIminBridge
} from './iminHardwareBridge.js';

export const ORDER_ALERT_SOUND_DEFAULT_ID = 'new_order';
export const ORDER_ALERT_SOUND_ID_STORAGE_KEY = 'pos_online_order_sound_id_v1';
export const ORDER_ALERT_SOUND_DOWNLOADS_STORAGE_KEY = 'pos_online_order_sound_downloads_v1';
export const ORDER_ALERT_SOUND_IMPORTED_STORAGE_KEY = 'pos_online_order_imported_sounds_v1';
export const ORDER_ALERT_SOUND_CACHE_NAME = 'pos-order-alert-sounds-v1';
export const ORDER_ALERT_SOUND_MAX_BYTES = 256 * 1024;
export const ORDER_ALERT_SOUND_IMPORT_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const ORDER_ALERT_SOUND_IMPORT_MAX_DURATION_SECONDS = 30;
export const ORDER_ALERT_SOUND_IMPORT_SAMPLE_RATE = 22_050;
export const ORDER_ALERT_SOUND_IMPORT_BITRATE_KBPS = 64;
export const ORDER_ALERT_SOUND_REPEAT_INTERVAL_MS = 2_000;
export const ORDER_ALERT_SOUND_REPEAT_DURATION_MS = 30_000;

export const formatOrderAlertSoundKilobytes = (bytes) => (
  `${Math.max(1, Math.ceil(Number(bytes) / 1024))} KB`
);

const SOUND_ASSET_BASE_PATH = '/sounds/order-alerts';

export const ORDER_ALERT_SOUND_CATALOG = Object.freeze([
  Object.freeze({
    id: ORDER_ALERT_SOUND_DEFAULT_ID,
    label: 'Device default',
    description: 'Uses the terminal notification sound already configured on this device.',
    assetPath: `${SOUND_ASSET_BASE_PATH}/soft-chime.wav`,
    mimeType: 'audio/wav',
    fileName: 'soft-chime.wav',
    isDefault: true
  }),
  Object.freeze({
    id: 'gentle-bell',
    label: 'Gentle bell',
    description: 'A soft two-tone bell for a calm counter.',
    assetPath: `${SOUND_ASSET_BASE_PATH}/gentle-bell.wav`,
    mimeType: 'audio/wav',
    fileName: 'gentle-bell.wav'
  }),
  Object.freeze({
    id: 'bright-ping',
    label: 'Bright ping',
    description: 'A short, clear ping that is easy to notice.',
    assetPath: `${SOUND_ASSET_BASE_PATH}/bright-ping.wav`,
    mimeType: 'audio/wav',
    fileName: 'bright-ping.wav'
  }),
  Object.freeze({
    id: 'two-note-ding',
    label: 'Two-note ding',
    description: 'A light rising pair of notes for busy service.',
    assetPath: `${SOUND_ASSET_BASE_PATH}/two-note-ding.wav`,
    mimeType: 'audio/wav',
    fileName: 'two-note-ding.wav'
  }),
  Object.freeze({
    id: 'calm-notification',
    label: 'Calm notification',
    description: 'A low-volume notification with a smooth finish.',
    assetPath: `${SOUND_ASSET_BASE_PATH}/calm-notification.wav`,
    mimeType: 'audio/wav',
    fileName: 'calm-notification.wav'
  }),
  Object.freeze({
    id: 'short-alert',
    label: 'Short alert',
    description: 'A compact alert for terminals near the kitchen.',
    assetPath: `${SOUND_ASSET_BASE_PATH}/short-alert.wav`,
    mimeType: 'audio/wav',
    fileName: 'short-alert.wav'
  })
]);

const IMPORTED_SOUND_ID_PATTERN = /^imported-[a-z0-9-]{8,80}$/;
const SUPPORTED_AUDIO_EXTENSION_PATTERN = /\.(aac|flac|m4a|mp3|ogg|wav|webm)$/i;

// Keep newly imported metadata available for the current POS session even when
// a browser blocks or temporarily rejects localStorage writes. The compressed
// audio remains in Cache Storage, so the live catalog must not depend on a
// successful synchronous preference write before it can render the imported
// sound card.
let runtimeImportedOrderAlertSounds = [];

const normalizeImportedSound = (value) => {
  const id = String(value?.id || '').trim();
  if (!IMPORTED_SOUND_ID_PATTERN.test(id)) return null;

  const originalBytes = Number(value?.originalBytes);
  const compressedBytes = Number(value?.compressedBytes);
  const durationSeconds = Number(value?.durationSeconds);
  const originalDurationSeconds = Number(value?.originalDurationSeconds);
  if (!Number.isFinite(compressedBytes) || compressedBytes <= 0 || compressedBytes > ORDER_ALERT_SOUND_MAX_BYTES) {
    return null;
  }

  const label = String(value?.label || 'Imported sound')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64) || 'Imported sound';
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.min(durationSeconds, ORDER_ALERT_SOUND_IMPORT_MAX_DURATION_SECONDS)
    : 0;
  const safeOriginalDuration = Number.isFinite(originalDurationSeconds) && originalDurationSeconds > 0
    ? Math.min(originalDurationSeconds, 24 * 60 * 60)
    : safeDuration;

  return Object.freeze({
    id,
    label,
    description: 'Imported and compressed locally for this terminal.',
    assetPath: `${SOUND_ASSET_BASE_PATH}/imported/${id}.mp3`,
    mimeType: 'audio/mpeg',
    fileName: `${id}.mp3`,
    isImported: true,
    originalBytes: Number.isFinite(originalBytes) && originalBytes > 0 ? originalBytes : 0,
    compressedBytes,
    durationSeconds: safeDuration,
    originalDurationSeconds: safeOriginalDuration
  });
};

const normalizeImportedSoundList = (sounds) => [...new Map(
  (Array.isArray(sounds) ? sounds : [])
    .map(normalizeImportedSound)
    .filter(Boolean)
    .map((sound) => [sound.id, sound])
).values()];

const readStoredImportedOrderAlertSoundsRaw = () => {
  const raw = String(safeLocalStorageGet(ORDER_ALERT_SOUND_IMPORTED_STORAGE_KEY) || '').trim();
  if (!raw) return normalizeImportedSoundList(runtimeImportedOrderAlertSounds);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeImportedSoundList(runtimeImportedOrderAlertSounds);
    return normalizeImportedSoundList([...parsed, ...runtimeImportedOrderAlertSounds]);
  } catch {
    return normalizeImportedSoundList(runtimeImportedOrderAlertSounds);
  }
};

export const readStoredImportedOrderAlertSounds = () => readStoredImportedOrderAlertSoundsRaw();

const writeStoredImportedOrderAlertSounds = (sounds) => {
  const normalized = normalizeImportedSoundList(sounds);
  runtimeImportedOrderAlertSounds = normalizeImportedSoundList([
    ...runtimeImportedOrderAlertSounds,
    ...normalized
  ]);
  return safeLocalStorageSet(
    ORDER_ALERT_SOUND_IMPORTED_STORAGE_KEY,
    JSON.stringify(normalized.map((sound) => ({
      id: sound.id,
      label: sound.label,
      originalBytes: sound.originalBytes,
      compressedBytes: sound.compressedBytes,
      durationSeconds: sound.durationSeconds,
      originalDurationSeconds: sound.originalDurationSeconds
    })))
  );
};

export const getOrderAlertSoundCatalog = () => [
  ...ORDER_ALERT_SOUND_CATALOG,
  ...readStoredImportedOrderAlertSoundsRaw()
];

const getOrderAlertSoundByIdFromCatalog = (soundId) => (
  getOrderAlertSoundCatalog().find((sound) => sound.id === String(soundId || '').trim()) || null
);

let activeOrderAlertAudio = null;
let activeOrderAlertObjectUrl = '';
const activeOrderAlertAudioContexts = new Set();
let activeOrderAlertLoop = null;

const notifyOrderAlertLoopFinished = (loop) => {
  if (!loop || loop.finished) return;
  loop.finished = true;
  try {
    loop.onFinished?.();
  } catch {
    // A completion callback must not interrupt alert cleanup or queue polling.
  }
};

export const getOrderAlertSoundById = (soundId) => (
  getOrderAlertSoundByIdFromCatalog(soundId)
  || ORDER_ALERT_SOUND_CATALOG[0]
);

export const readStoredOrderAlertSoundId = () => {
  const stored = String(safeLocalStorageGet(ORDER_ALERT_SOUND_ID_STORAGE_KEY) || '').trim();
  return getOrderAlertSoundByIdFromCatalog(stored)?.id || ORDER_ALERT_SOUND_DEFAULT_ID;
};

export const writeStoredOrderAlertSoundId = (soundId) => {
  const sound = getOrderAlertSoundById(soundId);
  return safeLocalStorageSet(ORDER_ALERT_SOUND_ID_STORAGE_KEY, sound.id);
};

export const readStoredDownloadedOrderAlertSoundIds = () => {
  const raw = String(safeLocalStorageGet(ORDER_ALERT_SOUND_DOWNLOADS_STORAGE_KEY) || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed
      .map((soundId) => String(soundId || '').trim())
      .filter((soundId) => ORDER_ALERT_SOUND_CATALOG.some((sound) => sound.id === soundId) && soundId !== ORDER_ALERT_SOUND_DEFAULT_ID))];
  } catch {
    return [];
  }
};

export const writeStoredDownloadedOrderAlertSoundIds = (soundIds) => {
  const normalized = [...new Set((Array.isArray(soundIds) ? soundIds : [])
    .map((soundId) => String(soundId || '').trim())
    .filter((soundId) => ORDER_ALERT_SOUND_CATALOG.some((sound) => sound.id === soundId) && soundId !== ORDER_ALERT_SOUND_DEFAULT_ID))];
  return safeLocalStorageSet(ORDER_ALERT_SOUND_DOWNLOADS_STORAGE_KEY, JSON.stringify(normalized));
};

const getCacheStorage = () => {
  if (typeof window !== 'undefined' && window.caches) return window.caches;
  if (typeof globalThis !== 'undefined' && globalThis.caches) return globalThis.caches;
  return null;
};

const soundAssetUrl = (sound) => resolveAppAssetUrl(sound.assetPath);

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  if (typeof btoa === 'function') return btoa(binary);
  if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
    return globalThis.Buffer.from(bytes).toString('base64');
  }
  throw new Error('This device cannot encode an order alert sound.');
};

const replaceDownloadedSoundId = (soundId) => {
  const downloaded = new Set(readStoredDownloadedOrderAlertSoundIds());
  downloaded.add(soundId);
  writeStoredDownloadedOrderAlertSoundIds([...downloaded]);
  return [...downloaded];
};

export const isOrderAlertSoundDownloaded = (soundId, downloadedSoundIds = null) => {
  const sound = getOrderAlertSoundById(soundId);
  if (sound.isDefault || sound.isImported) return true;
  const ids = Array.isArray(downloadedSoundIds)
    ? downloadedSoundIds
    : readStoredDownloadedOrderAlertSoundIds();
  return ids.includes(sound.id);
};

const getAudioContextConstructor = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

const getFileExtension = (fileName) => String(fileName || '').match(/\.[^.]+$/)?.[0] || '';

const isAudioFile = (file) => (
  String(file?.type || '').toLowerCase().startsWith('audio/')
  || SUPPORTED_AUDIO_EXTENSION_PATTERN.test(String(file?.name || ''))
);

const createImportedSoundId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  const fallback = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `imported-${String(uuid || fallback).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 76)}`;
};

const getImportedSoundLabel = (file) => {
  const withoutExtension = String(file?.name || 'Imported sound').replace(/\.[^.]+$/, '');
  return withoutExtension
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64) || 'Imported sound';
};

const downsampleToMonoPcm = (audioBuffer) => {
  const sourceRate = Number(audioBuffer?.sampleRate) || ORDER_ALERT_SOUND_IMPORT_SAMPLE_RATE;
  const sourceLength = Number(audioBuffer?.length);
  const sourceDuration = Number(audioBuffer?.duration);
  if (!Number.isFinite(sourceLength) || sourceLength <= 0 || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    throw new Error('The selected audio has no usable duration.');
  }

  const durationSeconds = Math.min(sourceDuration, ORDER_ALERT_SOUND_IMPORT_MAX_DURATION_SECONDS);
  const targetLength = Math.max(1, Math.ceil(durationSeconds * ORDER_ALERT_SOUND_IMPORT_SAMPLE_RATE));
  const sourceChannels = Math.max(1, Number(audioBuffer?.numberOfChannels) || 1);
  const channelData = Array.from({ length: sourceChannels }, (_, channelIndex) => (
    audioBuffer.getChannelData(channelIndex)
  ));
  const ratio = sourceRate / ORDER_ALERT_SOUND_IMPORT_SAMPLE_RATE;
  const pcm = new Int16Array(targetLength);

  for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
    const sourceIndex = Math.min(sourceLength - 1, Math.floor(targetIndex * ratio));
    let sample = 0;
    channelData.forEach((channel) => {
      sample += Number(channel?.[sourceIndex] || 0);
    });
    sample /= sourceChannels;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm[targetIndex] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  return { pcm, durationSeconds, originalDurationSeconds: sourceDuration };
};

const encodePcmToMp3 = async (pcm, sampleRate) => {
  const lameModule = await import('@breezystack/lamejs');
  const Mp3Encoder = lameModule.Mp3Encoder || lameModule.default?.Mp3Encoder;
  if (typeof Mp3Encoder !== 'function') {
    throw new Error('The audio compressor is unavailable on this device.');
  }

  const encoder = new Mp3Encoder(1, sampleRate, ORDER_ALERT_SOUND_IMPORT_BITRATE_KBPS);
  const mp3Chunks = [];
  const frameSize = 1_152;
  for (let offset = 0; offset < pcm.length; offset += frameSize) {
    const encoded = encoder.encodeBuffer(pcm.subarray(offset, offset + frameSize));
    if (encoded.length > 0) mp3Chunks.push(new Int8Array(encoded));
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Chunks.push(new Int8Array(flushed));
  return new Blob(mp3Chunks, { type: 'audio/mpeg' });
};

export const importOrderAlertSound = async (file) => {
  const sourceBytes = Number(file?.size);
  if (!file || !Number.isFinite(sourceBytes) || sourceBytes <= 0) {
    throw new Error('Choose an audio file to import.');
  }
  if (!isAudioFile(file)) {
    throw new Error(`The selected file${getFileExtension(file?.name)} is not a supported audio file.`);
  }
  if (sourceBytes > ORDER_ALERT_SOUND_IMPORT_MAX_SOURCE_BYTES) {
    throw new Error('The source audio must be 10 MB or smaller.');
  }

  const AudioContext = getAudioContextConstructor();
  if (typeof AudioContext !== 'function') {
    throw new Error('This device cannot convert audio files in the browser.');
  }

  const context = new AudioContext();
  let audioBuffer;
  try {
    audioBuffer = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('The audio file could not be decoded. Try an MP3, WAV, M4A, OGG, AAC, FLAC, or WebM file.');
  } finally {
    try {
      await context.close?.();
    } catch {
      // Closing the temporary decode context is best effort.
    }
  }

  const { pcm, durationSeconds, originalDurationSeconds } = downsampleToMonoPcm(audioBuffer);
  const compressedBlob = await encodePcmToMp3(pcm, ORDER_ALERT_SOUND_IMPORT_SAMPLE_RATE);
  if (compressedBlob.size <= 0 || compressedBlob.size > ORDER_ALERT_SOUND_MAX_BYTES) {
    throw new Error('The compressed audio is too large. Choose a shorter or lighter sound.');
  }

  const cacheStorage = getCacheStorage();
  if (!cacheStorage) {
    throw new Error('This device does not support local sound storage.');
  }

  const id = createImportedSoundId();
  const sound = normalizeImportedSound({
    id,
    label: getImportedSoundLabel(file),
    originalBytes: sourceBytes,
    compressedBytes: compressedBlob.size,
    durationSeconds,
    originalDurationSeconds
  });
  const url = soundAssetUrl(sound);
  const cache = await cacheStorage.open(ORDER_ALERT_SOUND_CACHE_NAME);
  await cache.put(url, new Response(compressedBlob, {
    headers: { 'Content-Type': sound.mimeType }
  }));

  try {
    const nativeSave = saveOrderAlertSoundWithIminBridge(
      sound.id,
      arrayBufferToBase64(await compressedBlob.arrayBuffer()),
      sound.mimeType
    );
    if (nativeSave.handled && nativeSave.result?.success === false) {
      throw new Error(nativeSave.result.message || 'The device could not save the imported sound.');
    }
    writeStoredImportedOrderAlertSounds([
      ...readStoredImportedOrderAlertSoundsRaw(),
      sound
    ]);
  } catch (error) {
    await cache.delete(url).catch(() => {});
    throw error;
  }

  return sound;
};

export const downloadOrderAlertSound = async (soundId) => {
  const sound = getOrderAlertSoundById(soundId);
  if (sound.isDefault) return readStoredDownloadedOrderAlertSoundIds();

  const cacheStorage = getCacheStorage();
  if (!cacheStorage) {
    throw new Error('This device does not support local sound downloads.');
  }

  const url = soundAssetUrl(sound);
  if (!url) throw new Error('The selected order alert sound is unavailable.');

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`The selected sound could not be downloaded (${response.status}).`);
  }

  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (contentLength > ORDER_ALERT_SOUND_MAX_BYTES) {
    throw new Error('The selected sound is too large for a POS alert.');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > ORDER_ALERT_SOUND_MAX_BYTES) {
    throw new Error('The selected sound is too large or empty.');
  }

  const cache = await cacheStorage.open(ORDER_ALERT_SOUND_CACHE_NAME);
  await cache.put(url, new Response(buffer, {
    headers: { 'Content-Type': sound.mimeType }
  }));

  try {
    const nativeSave = saveOrderAlertSoundWithIminBridge(
      sound.id,
      arrayBufferToBase64(buffer),
      sound.mimeType
    );
    if (nativeSave.handled && nativeSave.result?.success === false) {
      throw new Error(nativeSave.result.message || 'The device could not save the selected sound.');
    }
  } catch (error) {
    await cache.delete(url).catch(() => {});
    throw error;
  }

  return replaceDownloadedSoundId(sound.id);
};

const readCachedOrderAlertResponse = async (sound) => {
  const cacheStorage = getCacheStorage();
  if (!cacheStorage) return null;
  const cache = await cacheStorage.open(ORDER_ALERT_SOUND_CACHE_NAME);
  return cache.match(soundAssetUrl(sound));
};

const stopActiveOrderAlertAudio = () => {
  if (activeOrderAlertAudio) {
    try {
      activeOrderAlertAudio.pause();
      activeOrderAlertAudio.currentTime = 0;
    } catch {
      // Ignore cleanup failures from a browser audio element that already ended.
    }
    activeOrderAlertAudio = null;
  }
  if (activeOrderAlertObjectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(activeOrderAlertObjectUrl);
    activeOrderAlertObjectUrl = '';
  }
};

const stopActiveOrderAlertAudioContexts = () => {
  [...activeOrderAlertAudioContexts].forEach((context) => {
    activeOrderAlertAudioContexts.delete(context);
    try {
      const closeResult = context.close?.();
      if (closeResult && typeof closeResult.catch === 'function') {
        void closeResult.catch(() => {});
      }
    } catch {
      // Ignore cleanup failures from a context that already closed.
    }
  });
};

const playbackIsAllowed = (shouldPlay) => (
  typeof shouldPlay !== 'function' || shouldPlay()
);

const playBrowserAudioResponse = async (response, shouldPlay = null) => {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') return false;
  if (!playbackIsAllowed(shouldPlay)) return false;
  const blob = await response.blob();
  if (!playbackIsAllowed(shouldPlay)) return false;
  const objectUrl = URL.createObjectURL(blob);
  const audio = new window.Audio(objectUrl);
  stopActiveOrderAlertAudio();
  activeOrderAlertObjectUrl = objectUrl;
  activeOrderAlertAudio = audio;
  const cleanup = () => {
    if (activeOrderAlertAudio === audio) activeOrderAlertAudio = null;
    if (activeOrderAlertObjectUrl === objectUrl) {
      activeOrderAlertObjectUrl = '';
      URL.revokeObjectURL(objectUrl);
    }
  };
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  try {
    await audio.play();
    if (!playbackIsAllowed(shouldPlay)) {
      if (activeOrderAlertAudio === audio) stopActiveOrderAlertAudio();
      return false;
    }
    return true;
  } catch {
    cleanup();
    return false;
  }
};

const playGeneratedBrowserChime = async (shouldPlay = null) => {
  if (typeof window === 'undefined') return false;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContext !== 'function') return false;
  if (!playbackIsAllowed(shouldPlay)) return false;

  let context = null;
  try {
    context = new AudioContext();
    activeOrderAlertAudioContexts.add(context);
    const closeContext = () => {
      if (!activeOrderAlertAudioContexts.has(context)) return;
      activeOrderAlertAudioContexts.delete(context);
      try {
        const closeResult = context.close?.();
        if (closeResult && typeof closeResult.catch === 'function') {
          void closeResult.catch(() => {});
        }
      } catch {
        // Ignore cleanup failures from a context that already closed.
      }
    };
    if (context.state === 'suspended') await context.resume();
    if (!playbackIsAllowed(shouldPlay)) {
      closeContext();
      return false;
    }
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.085, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    gain.connect(context.destination);

    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.08);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + 0.34);
    });
    window.setTimeout(closeContext, 500);
    return true;
  } catch {
    if (context) {
      activeOrderAlertAudioContexts.delete(context);
      try {
        const closeResult = context.close?.();
        if (closeResult && typeof closeResult.catch === 'function') {
          void closeResult.catch(() => {});
        }
      } catch {
        // Ignore cleanup failures from a context that already closed.
      }
    }
    return false;
  }
};

export const playOrderAlertSound = async (soundId = ORDER_ALERT_SOUND_DEFAULT_ID, options = {}) => {
  const shouldPlay = typeof options?.shouldPlay === 'function' ? options.shouldPlay : null;
  if (!playbackIsAllowed(shouldPlay)) return false;
  const sound = getOrderAlertSoundById(soundId);
  const nativePlayback = playOrderAlertWithIminBridge(sound.id);
  if (nativePlayback.handled) return nativePlayback.result?.success !== false;

  try {
    const cached = await readCachedOrderAlertResponse(sound);
    if (cached) return playBrowserAudioResponse(cached, shouldPlay);

    const response = await fetch(soundAssetUrl(sound), { cache: 'no-store' });
    if (response.ok) return playBrowserAudioResponse(response, shouldPlay);
  } catch {
    // The generated chime below keeps the browser fallback independent of asset/network state.
  }

  return playGeneratedBrowserChime(shouldPlay);
};

const normalizePositiveMilliseconds = (value, fallback) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
};

export const stopOrderAlertSoundLoop = () => {
  const loop = activeOrderAlertLoop;
  if (loop) {
    loop.cancelled = true;
    clearTimeout(loop.nextTimer);
    clearTimeout(loop.stopTimer);
    activeOrderAlertLoop = null;
    notifyOrderAlertLoopFinished(loop);
  }
  stopActiveOrderAlertAudio();
  stopActiveOrderAlertAudioContexts();
  stopOrderAlertWithIminBridge();
};

export const startOrderAlertSoundLoop = (
  soundId = ORDER_ALERT_SOUND_DEFAULT_ID,
  options = {}
) => {
  stopOrderAlertSoundLoop();

  const intervalMs = normalizePositiveMilliseconds(
    options?.intervalMs,
    ORDER_ALERT_SOUND_REPEAT_INTERVAL_MS
  );
  const durationMs = normalizePositiveMilliseconds(
    options?.durationMs,
    ORDER_ALERT_SOUND_REPEAT_DURATION_MS
  );
  const loop = {
    cancelled: false,
    finished: false,
    onFinished: typeof options?.onFinished === 'function' ? options.onFinished : null,
    nextTimer: null,
    stopTimer: null
  };
  const expiresAt = Date.now() + durationMs;
  activeOrderAlertLoop = loop;

  const finish = () => {
    if (loop.cancelled) return;
    loop.cancelled = true;
    clearTimeout(loop.nextTimer);
    clearTimeout(loop.stopTimer);
    if (activeOrderAlertLoop === loop) activeOrderAlertLoop = null;
    stopActiveOrderAlertAudio();
    stopActiveOrderAlertAudioContexts();
    stopOrderAlertWithIminBridge();
    notifyOrderAlertLoopFinished(loop);
  };

  loop.stopTimer = setTimeout(finish, durationMs);

  const playNext = async () => {
    if (loop.cancelled || activeOrderAlertLoop !== loop) return;

    try {
      await playOrderAlertSound(soundId, {
        shouldPlay: () => !loop.cancelled && activeOrderAlertLoop === loop
      });
    } catch {
      // An unavailable sound must not stop the order queue or create an unhandled rejection.
    }

    if (loop.cancelled || activeOrderAlertLoop !== loop) return;
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      finish();
      return;
    }
    loop.nextTimer = setTimeout(playNext, Math.min(intervalMs, remainingMs));
  };

  void playNext();
  return finish;
};
