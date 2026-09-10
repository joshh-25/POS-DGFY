/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductQrScannerModal from '../components/ProductQrScannerModal.jsx';

// Stashed by the fake BrowserMultiFormatOneDReader below so a test can invoke the
// decode callback directly, as if ZXing had just read a barcode off the video frame.
let decodeCallback;
let decodeFromConstraints;
let controlsStop;

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: vi.fn().mockImplementation(function BrowserMultiFormatOneDReader() {
    this.decodeFromConstraints = (...args) => decodeFromConstraints(...args);
  })
}));

vi.mock('@zxing/library', () => ({
  BarcodeFormat: {
    EAN_8: 'EAN_8', EAN_13: 'EAN_13', UPC_A: 'UPC_A', UPC_E: 'UPC_E',
    ITF: 'ITF', CODE_128: 'CODE_128', CODE_39: 'CODE_39'
  },
  DecodeHintType: { POSSIBLE_FORMATS: 'POSSIBLE_FORMATS' }
}));

describe('ProductQrScannerModal re-arm', () => {
  beforeEach(() => {
    controlsStop = vi.fn();
    decodeCallback = null;
    decodeFromConstraints = vi.fn().mockImplementation((_constraints, _video, cb) => {
      decodeCallback = cb;
      return Promise.resolve({ stop: controlsStop });
    });

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const clickScan = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan/ }));
    });
  };

  const waitForStarted = async () => {
    // Flush the dynamic import()s and the decodeFromConstraints promise before the
    // decode callback is available to invoke.
    await waitFor(() => expect(decodeCallback).toBeTruthy());
  };

  it('re-arms the Scan button in place after a successful decode (Case A)', async () => {
    const onDetected = vi.fn();
    render(
      <ProductQrScannerModal open onOpenChange={vi.fn()} onDetected={onDetected} />
    );

    await clickScan();
    await waitForStarted();

    expect(decodeCallback).toBeTruthy();

    await act(async () => {
      decodeCallback({ getText: () => '4800016641503' }, null, { stop: vi.fn() });
    });

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith('4800016641503');

    const scanButton = screen.getByRole('button', { name: 'Scan' });
    expect(scanButton.disabled).toBe(false);

    // The actual "second item" proof: pressing Scan again starts a second decode.
    await clickScan();
    await waitForStarted();
    expect(decodeFromConstraints).toHaveBeenCalledTimes(2);
  });

  it('does not strand the Scan button on "Starting..." after a close/reopen cycle (Case B)', async () => {
    const onDetected = vi.fn();
    const { rerender } = render(
      <ProductQrScannerModal open onOpenChange={vi.fn()} onDetected={onDetected} />
    );

    await clickScan();
    await waitForStarted();

    await act(async () => {
      decodeCallback({ getText: () => '4800016641503' }, null, { stop: vi.fn() });
    });

    await act(async () => {
      rerender(<ProductQrScannerModal open={false} onOpenChange={vi.fn()} onDetected={onDetected} />);
    });
    await act(async () => {
      rerender(<ProductQrScannerModal open onOpenChange={vi.fn()} onDetected={onDetected} />);
    });
    await waitForStarted();

    const scanButton = screen.getByRole('button', { name: 'Scan' });
    expect(scanButton.textContent).toContain('Scan');
    expect(scanButton.disabled).toBe(false);
  });

  it('owns scrolling and keyboard focus until it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    document.body.style.overflow = 'scroll';
    const { rerender } = render(
      <ProductQrScannerModal open onOpenChange={vi.fn()} onDetected={vi.fn()} />
    );

    expect(document.body.style.overflow).toBe('hidden');
    const closeButton = screen.getByRole('button', { name: 'Close product barcode scanner' });
    const modalButtons = screen.getByRole('dialog').querySelectorAll('button:not([disabled])');
    modalButtons[modalButtons.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    rerender(<ProductQrScannerModal open={false} onOpenChange={vi.fn()} onDetected={vi.fn()} />);
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
