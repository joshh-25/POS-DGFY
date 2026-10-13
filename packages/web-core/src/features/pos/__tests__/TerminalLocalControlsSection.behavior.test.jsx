/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosOperationsAccessSection from '../settings/PosOperationsAccessSection.jsx';
import PosOperationsDefaultsSection from '../settings/PosOperationsDefaultsSection.jsx';
import { TerminalIncomingOrderPopupField, TerminalSoundField } from '../settings/TerminalLocalControlsSection.jsx';
import { ORDER_ALERT_SOUND_IMPORTED_STORAGE_KEY } from '../utils/orderAlertSounds.js';

describe('TerminalIncomingOrderPopupField', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders enabled by default and toggles through the provided setter', () => {
    const setIncomingOrderPopupEnabled = vi.fn();

    render(
      <TerminalIncomingOrderPopupField
        setIncomingOrderPopupEnabled={setIncomingOrderPopupEnabled}
      />
    );

    expect(screen.queryByText('Show order details automatically when a new online order arrives. The notification badge remains available when disabled.')).toBeNull();

    const toggle = screen.getByRole('switch', { name: 'Incoming order popup' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);

    expect(setIncomingOrderPopupEnabled).toHaveBeenCalledTimes(1);
    expect(setIncomingOrderPopupEnabled.mock.calls[0][0](true)).toBe(false);
  });

  it('disables the toggle while the terminal is locked', () => {
    render(
      <TerminalIncomingOrderPopupField
        incomingOrderPopupEnabled={false}
        locked
      />
    );

    const toggle = screen.getByRole('switch', { name: 'Incoming order popup' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.hasAttribute('disabled')).toBe(true);
  });

  it('exposes the popup setting in the regular POS operations settings', () => {
    render(
      <PosOperationsDefaultsSection
        loading={false}
        savingTab=""
        posForm={{
          posOpenStatus: true,
          pettyCashSymbol: 'PHP',
          pettyCashAmount: 100,
          posWaitTimeMinutes: 15,
          inventoryLowStockDisplayThreshold: 5
        }}
        locations={[]}
        incomingOrders={[]}
        queueLocationScopeId={null}
        onlineOrderSoundEnabled
        setOnlineOrderSoundEnabled={vi.fn()}
        incomingOrderPopupEnabled
        setIncomingOrderPopupEnabled={vi.fn()}
        locked={false}
        saveDefaults={vi.fn()}
      />
    );

    expect(screen.queryByText('Show order details automatically for new online orders. The notification badge remains available when disabled.')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Incoming order popup' }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the sound library collapsed until the cashier opens it', () => {
    render(<TerminalSoundField />);

    const manageButton = screen.getByRole('button', { name: 'Manage sounds' });
    expect(manageButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Import audio' })).toBeNull();

    fireEvent.click(manageButton);

    expect(screen.getByRole('button', { name: 'Hide sounds' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Import audio' })).toBeTruthy();
  });

  it('lets a cashier download, preview, and select a downloaded sound', () => {
    const onDownload = vi.fn();
    const onPreview = vi.fn();
    const onSelect = vi.fn();

    render(
      <TerminalSoundField
        onlineOrderSoundEnabled={false}
        setOnlineOrderSoundEnabled={vi.fn()}
        downloadedOrderAlertSoundIds={['gentle-bell']}
        onDownloadOrderAlertSound={onDownload}
        onPreviewOrderAlertSound={onPreview}
        onSelectOrderAlertSound={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage sounds' }));
    expect(screen.getByRole('button', { name: 'Download Bright ping' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Gentle bell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Gentle bell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Bright ping' }));

    expect(onPreview).toHaveBeenCalledWith('gentle-bell');
    expect(onSelect).toHaveBeenCalledWith('gentle-bell');
    expect(onDownload).toHaveBeenCalledWith('bright-ping');
  });

  it('shows a stop action while a sound preview is repeating', () => {
    const onPreview = vi.fn();

    render(
      <TerminalSoundField
        onlineOrderSoundEnabled
        downloadedOrderAlertSoundIds={['gentle-bell']}
        previewingOrderAlertSoundId="gentle-bell"
        onPreviewOrderAlertSound={onPreview}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage sounds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop preview Gentle bell' }));

    expect(onPreview).toHaveBeenCalledWith('gentle-bell');
  });

  it('exposes an import control and forwards the selected audio file', () => {
    const onImport = vi.fn();
    const file = new File([new Uint8Array([1, 2, 3])], 'counter-chime.wav', { type: 'audio/wav' });

    render(
      <TerminalSoundField
        onImportOrderAlertSound={onImport}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage sounds' }));
    expect(screen.getByRole('button', { name: 'Import audio' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Import audio file'), {
      target: { files: [file] }
    });

    expect(onImport).toHaveBeenCalledWith(file);
  });

  it('renders imported sounds as available for immediate use', () => {
    localStorage.setItem(ORDER_ALERT_SOUND_IMPORTED_STORAGE_KEY, JSON.stringify([{
      id: 'imported-crying-baby-01',
      label: 'Crying newborn baby',
      originalBytes: 510174,
      compressedBytes: 185364,
      durationSeconds: 23.09,
      originalDurationSeconds: 23.09
    }]));

    render(<TerminalSoundField />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage sounds' }));
    expect(screen.getByText('Crying newborn baby')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use Crying newborn baby' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download Crying newborn baby' })).toBeNull();
    expect(screen.getByText('Imported on this device.')).toBeTruthy();
    expect(screen.queryByText('Imported and compressed locally for this terminal.')).toBeNull();
    expect(screen.queryByText(/Compressed MP3/)).toBeNull();
  });

  it('forwards the import handler through the POS operations settings section', () => {
    const onImport = vi.fn();
    const file = new File([new Uint8Array([1, 2, 3])], 'counter-chime.wav', { type: 'audio/wav' });

    render(
      <PosOperationsAccessSection
        terminalUser={{}}
        locked={false}
        canEditSettings
        loading={false}
        savingTab=""
        handlePosSave={vi.fn()}
        posForm={{
          posOpenStatus: true,
          pettyCashSymbol: 'PHP',
          pettyCashAmount: 100,
          posWaitTimeMinutes: 15,
          inventoryLowStockDisplayThreshold: 5
        }}
        setPosForm={vi.fn()}
        locations={[]}
        incomingOrders={[]}
        queueLocationScopeId={null}
        onImportOrderAlertSound={onImport}
        showTerminalOnlyControls={false}
        showPosDefaultsEditor
        showAttendanceEditor={false}
        showTeamAccessEditor={false}
        saveDefaults={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage sounds' }));
    fireEvent.change(screen.getByLabelText('Import audio file'), {
      target: { files: [file] }
    });

    expect(onImport).toHaveBeenCalledWith(file);
  });
});
