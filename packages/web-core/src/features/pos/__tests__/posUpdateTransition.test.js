import { describe, expect, it } from 'vitest';
import { POS_UPDATE_TRANSITION_EVENT, publishPosUpdateTransition } from '../utils/posUpdateTransition.js';

describe('POS update transition pulse', () => {
    it('dispatches a plain event with no payload', () => {
        const eventWindow = new EventTarget();
        eventWindow.CustomEvent = CustomEvent;
        let received;
        let callCount = 0;
        eventWindow.addEventListener(POS_UPDATE_TRANSITION_EVENT, (event) => {
            callCount += 1;
            received = event.detail;
        });

        publishPosUpdateTransition(eventWindow);

        expect(callCount).toBe(1);
        expect(received).toBeNull();
    });

    it('is a no-op when given a window-like object with no dispatchEvent', () => {
        expect(() => publishPosUpdateTransition({})).not.toThrow();
    });

    it('is a no-op when given nothing (no global window in this environment)', () => {
        expect(() => publishPosUpdateTransition(null)).not.toThrow();
    });
});
