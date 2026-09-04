/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MenuPhotoCaptureSheet from '../MenuPhotoCaptureSheet.jsx';

const SOURCE_WIDTH = 1920;
const SOURCE_HEIGHT = 1080;

// A frame with alternating columns reads as sharp; a flat frame reads as blurry.
const frame = (lumaAt, width = 48, height = 48) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const value = lumaAt(x, y);
            const index = (y * width + x) * 4;
            data[index] = value;
            data[index + 1] = value;
            data[index + 2] = value;
            data[index + 3] = 255;
        }
    }
    return { data, width, height };
};

const sharpFrame = () => frame((x) => (x % 2 === 0 ? 238 : 18));
const flatFrame = () => frame(() => 128);

let currentFrame = sharpFrame();
let stopTrack;
let getUserMedia;

const mockCanvas = () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: () => currentFrame
    }));
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
        callback(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
    };
};

describe('MenuPhotoCaptureSheet', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        currentFrame = sharpFrame();
        stopTrack = vi.fn();
        getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });

        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: (...args) => getUserMedia(...args) }
        });
        Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
            configurable: true,
            get: () => SOURCE_WIDTH
        });
        Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
            configurable: true,
            get: () => SOURCE_HEIGHT
        });
        HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
        URL.createObjectURL = vi.fn(() => 'blob:preview');
        URL.revokeObjectURL = vi.fn();
        Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
        mockCanvas();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    const renderLive = async (props = {}) => {
        const view = render(
            <MenuPhotoCaptureSheet
                onAddFiles={props.onAddFiles || vi.fn()}
                onCancel={props.onCancel || vi.fn()}
                onUseFilePicker={props.onUseFilePicker || vi.fn()}
                remainingSlots={props.remainingSlots ?? 20}
            />
        );
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        return view;
    };

    it('asks for the rear camera and shows the live preview', async () => {
        await renderLive();

        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(getUserMedia.mock.calls[0][0].video.facingMode).toEqual({ ideal: 'environment' });
        expect(screen.getByRole('button', { name: /Take Photo/ })).toBeTruthy();
    });

    it('warns about a bad frame before the shutter without disabling it', async () => {
        currentFrame = flatFrame();
        await renderLive();

        await act(async () => { await vi.advanceTimersByTimeAsync(700); });

        expect(screen.getByText(/Looks blurry/)).toBeTruthy();
        // The warning never becomes a gate — this is a product decision.
        expect(screen.getByRole('button', { name: /Take Photo/ }).disabled).toBe(false);
    });

    it('captures a JPEG File and hands it over on add', async () => {
        const onAddFiles = vi.fn();
        await renderLive({ onAddFiles });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Take Photo/ }));
        });

        expect(screen.getByText('Looks good')).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Add 1 Photo\(s\)/ }));
        });

        expect(onAddFiles).toHaveBeenCalledTimes(1);
        const [files] = onAddFiles.mock.calls[0];
        expect(files).toHaveLength(1);
        expect(files[0]).toBeInstanceOf(File);
        expect(files[0].type).toBe('image/jpeg');
        // Handing the files over also releases the camera.
        expect(stopTrack).toHaveBeenCalled();
    });

    it('keeps a warned-about shot and labels it rather than discarding it', async () => {
        currentFrame = flatFrame();
        const onAddFiles = vi.fn();
        await renderLive({ onAddFiles });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Take Photo/ }));
        });

        expect(screen.getAllByText(/Looks blurry/).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /Add 1 Photo\(s\)/ }).disabled).toBe(false);
    });

    it('stops offering the shutter once the batch has no slots left', async () => {
        await renderLive({ remainingSlots: 0 });

        expect(screen.getByText(/already at its file limit/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Take Photo/ }).disabled).toBe(true);
    });

    it('explains that HTTPS is required instead of looking broken on an insecure origin', async () => {
        const onUseFilePicker = vi.fn();
        // A POS served over plain HTTP on a LAN IP: mediaDevices does not exist
        // at all, so without this check the sheet would blame the device.
        Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });

        await renderLive({ onUseFilePicker });

        expect(screen.getByText(/requires HTTPS/)).toBeTruthy();
        expect(getUserMedia).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Add photos from device/ }));
        expect(onUseFilePicker).toHaveBeenCalledTimes(1);

        Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    });

    it('falls back to the file picker when camera permission is refused', async () => {
        const onUseFilePicker = vi.fn();
        getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));

        await renderLive({ onUseFilePicker });

        expect(screen.getByText(/Camera access was blocked/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Take Photo/ })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Add photos from device/ }));
        expect(onUseFilePicker).toHaveBeenCalledTimes(1);
    });

    it('releases the camera when unmounted mid-session', async () => {
        const { unmount } = await renderLive();

        unmount();

        expect(stopTrack).toHaveBeenCalled();
    });
});
