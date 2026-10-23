/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  playOrderAlertWithIminBridge,
  saveOrderAlertSoundWithIminBridge,
  stopOrderAlertWithIminBridge,
  Mp3Encoder
} = vi.hoisted(() => ({
  playOrderAlertWithIminBridge: vi.fn(),
  saveOrderAlertSoundWithIminBridge: vi.fn(() => ({ handled: false, result: null })),
  stopOrderAlertWithIminBridge: vi.fn(),
  Mp3Encoder: vi.fn(function MockMp3Encoder() {
    return {
      encodeBuffer: vi.fn(() => new Int8Array()),
      flush: vi.fn(() => new Int8Array([0xff, 0xfb, 0x00]))
    };
  })
}));

vi.mock('../iminHardwareBridge.js', () => ({
  playOrderAlertWithIminBridge,
  stopOrderAlertWithIminBridge,
  saveOrderAlertSoundWithIminBridge
}));

vi.mock('@breezystack/lamejs', () => ({ Mp3Encoder }));

import {
  ORDER_ALERT_SOUND_DEFAULT_ID,
  ORDER_ALERT_SOUND_DOWNLOADS_STORAGE_KEY,
  ORDER_ALERT_SOUND_IMPORTED_STORAGE_KEY,
  ORDER_ALERT_SOUND_ID_STORAGE_KEY,
  ORDER_ALERT_SOUND_REPEAT_DURATION_MS,
  ORDER_ALERT_SOUND_REPEAT_INTERVAL_MS,
  downloadOrderAlertSound,
  getOrderAlertSoundById,
  importOrderAlertSound,
  readStoredImportedOrderAlertSounds,
  readStoredDownloadedOrderAlertSoundIds,
  readStoredOrderAlertSoundId,
  startOrderAlertSoundLoop,
  stopOrderAlertSoundLoop,
  writeStoredOrderAlertSoundId
} from '../orderAlertSounds.js';

describe('order alert sound storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopOrderAlertSoundLoop();
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('uses the existing device sound when no sound preference has been saved', () => {
    expect(readStoredOrderAlertSoundId()).toBe(ORDER_ALERT_SOUND_DEFAULT_ID);

    writeStoredOrderAlertSoundId('gentle-bell');

    expect(localStorage.getItem(ORDER_ALERT_SOUND_ID_STORAGE_KEY)).toBe('gentle-bell');
    expect(readStoredOrderAlertSoundId()).toBe('gentle-bell');
  });

  it('downloads a bundled sound into Cache Storage and records only its metadata', async () => {
    const cachePut = vi.fn();
    const cacheDelete = vi.fn();
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ put: cachePut, delete: cacheDelete })
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => '64' },
      arrayBuffer: async () => new Uint8Array([82, 73, 70, 70, 1, 2, 3]).buffer
    }));

    const downloadedIds = await downloadOrderAlertSound('gentle-bell');

    expect(downloadedIds).toEqual(['gentle-bell']);
    expect(cachePut).toHaveBeenCalledTimes(1);
    expect(cacheDelete).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(ORDER_ALERT_SOUND_DOWNLOADS_STORAGE_KEY))).toEqual(['gentle-bell']);
    expect(readStoredDownloadedOrderAlertSoundIds()).toEqual(['gentle-bell']);
  });

  it('converts an imported audio file to a local compressed MP3 and remembers its KB metadata', async () => {
    const cachePut = vi.fn();
    const cacheDelete = vi.fn();
    vi.stubGlobal('Response', class MockResponse {
      constructor(body, init = {}) {
        this.body = body;
        const headers = new Map(Object.entries(init.headers || {}).map(([name, value]) => [name.toLowerCase(), value]));
        this.headers = { get: (name) => headers.get(String(name).toLowerCase()) || null };
      }
    });
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ put: cachePut, delete: cacheDelete })
    });

    const audioBuffer = {
      duration: 2,
      length: 88_200,
      numberOfChannels: 1,
      sampleRate: 44_100,
      getChannelData: vi.fn(() => new Float32Array(88_200).fill(0.1))
    };
    const decodeAudioData = vi.fn().mockResolvedValue(audioBuffer);
    const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('AudioContext', vi.fn(function MockAudioContext() {
      return { decodeAudioData, close };
    }));

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'counter-chime.wav', { type: 'audio/wav' });
    const importedSound = await importOrderAlertSound(file);

    expect(importedSound.id).toMatch(/^imported-/);
    expect(importedSound.mimeType).toBe('audio/mpeg');
    expect(importedSound.originalBytes).toBe(file.size);
    expect(importedSound.compressedBytes).toBe(3);
    expect(importedSound.durationSeconds).toBe(2);
    expect(importedSound.originalDurationSeconds).toBe(2);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(Mp3Encoder).toHaveBeenCalledWith(1, 22_050, 64);
    expect(cachePut).toHaveBeenCalledTimes(1);
    expect(cachePut.mock.calls[0][1].body.type).toBe('audio/mpeg');
    expect(cachePut.mock.calls[0][1].headers.get('content-type')).toBe('audio/mpeg');
    expect(cachePut.mock.calls[0][0]).toContain(`/sounds/order-alerts/imported/${importedSound.id}.mp3`);
    expect(saveOrderAlertSoundWithIminBridge).toHaveBeenCalledWith(
      importedSound.id,
      expect.any(String),
      'audio/mpeg'
    );
    expect(JSON.parse(localStorage.getItem(ORDER_ALERT_SOUND_IMPORTED_STORAGE_KEY))).toEqual([
      expect.objectContaining({
        id: importedSound.id,
        originalBytes: file.size,
        compressedBytes: 3
      })
    ]);
    expect(readStoredImportedOrderAlertSounds()).toEqual([importedSound]);
    expect(getOrderAlertSoundById(importedSound.id)).toEqual(importedSound);

    writeStoredOrderAlertSoundId(importedSound.id);
    expect(readStoredOrderAlertSoundId()).toBe(importedSound.id);
  });

  it('repeats an incoming-order sound every 2 seconds for at most 30 seconds', async () => {
    vi.useFakeTimers();
    playOrderAlertWithIminBridge.mockReturnValue({
      handled: true,
      result: { success: true }
    });

    const onFinished = vi.fn();
    startOrderAlertSoundLoop('two-note-ding', { onFinished });
    expect(playOrderAlertWithIminBridge).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ORDER_ALERT_SOUND_REPEAT_INTERVAL_MS * 2);
    expect(playOrderAlertWithIminBridge).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(
      ORDER_ALERT_SOUND_REPEAT_DURATION_MS - ORDER_ALERT_SOUND_REPEAT_INTERVAL_MS * 2
    );
    expect(playOrderAlertWithIminBridge).toHaveBeenCalledTimes(15);

    await vi.advanceTimersByTimeAsync(ORDER_ALERT_SOUND_REPEAT_INTERVAL_MS * 2);
    expect(playOrderAlertWithIminBridge).toHaveBeenCalledTimes(15);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('stops repeating immediately when the alert is dismissed', async () => {
    vi.useFakeTimers();
    playOrderAlertWithIminBridge.mockReturnValue({
      handled: true,
      result: { success: true }
    });

    startOrderAlertSoundLoop('two-note-ding');
    stopOrderAlertWithIminBridge.mockClear();
    stopOrderAlertSoundLoop();

    await vi.advanceTimersByTimeAsync(ORDER_ALERT_SOUND_REPEAT_INTERVAL_MS * 3);
    expect(playOrderAlertWithIminBridge).toHaveBeenCalledTimes(1);
    expect(stopOrderAlertWithIminBridge).toHaveBeenCalledTimes(1);
  });

  it('closes an in-flight generated browser chime when the alert is dismissed', async () => {
    vi.useFakeTimers();
    playOrderAlertWithIminBridge.mockReturnValue({
      handled: false,
      result: null
    });

    let resolveResume;
    const context = {
      state: 'suspended',
      resume: vi.fn(() => new Promise((resolve) => {
        resolveResume = resolve;
      })),
      close: vi.fn().mockResolvedValue(undefined)
    };
    vi.stubGlobal('AudioContext', vi.fn(function MockAudioContext() {
      return context;
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    startOrderAlertSoundLoop('new_order');
    await Promise.resolve();
    await Promise.resolve();

    stopOrderAlertSoundLoop();
    expect(context.close).toHaveBeenCalledTimes(1);

    resolveResume?.();
    await Promise.resolve();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
