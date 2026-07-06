import { describe, expect, it } from 'vitest';
import { POS_HARDWARE_MESSAGE_MODAL_ENABLED } from '../posHardwareMessageBus.js';

describe('POS hardware message policy', () => {
  it('keeps hardware messages modal-enabled', () => {
    expect(POS_HARDWARE_MESSAGE_MODAL_ENABLED).toBe(true);
  });
});
