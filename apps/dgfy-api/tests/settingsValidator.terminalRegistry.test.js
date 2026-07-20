import { jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('settings validator terminal registry payload', () => {
  it('accepts valid pos_terminal_registry payload', () => {
    const req = {
      body: {
        pos_terminal_registry: [
          { terminal_id: 'COUNTER-01', label: 'Front Counter', is_active: true, is_default: true },
          { terminal_id: 'KIOSK-01', label: 'Self Service Kiosk', is_active: true, is_default: false }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.pos_terminal_registry).toEqual(expect.arrayContaining([
      expect.objectContaining({ terminal_id: 'COUNTER-01', is_default: true })
    ]));
  });

  it('accepts multiple active terminals assigned to the same location', () => {
    const req = {
      body: {
        pos_terminal_registry: [
          { terminal_id: 'COUNTER-01', location_id: 7, is_active: true, is_default: true },
          { terminal_id: 'COUNTER-02', location_id: 7, is_active: true, is_default: false }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects duplicate terminal identifiers', () => {
    const req = {
      body: {
        pos_terminal_registry: [
          { terminal_id: 'counter-01', is_active: true, is_default: true },
          { terminal_id: 'COUNTER-01', is_active: true, is_default: false }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects multiple defaults and inactive default entries', () => {
    const multipleDefaultsReq = {
      body: {
        pos_terminal_registry: [
          { terminal_id: 'COUNTER-01', is_active: true, is_default: true },
          { terminal_id: 'KIOSK-01', is_active: true, is_default: true }
        ]
      }
    };
    const inactiveDefaultReq = {
      body: {
        pos_terminal_registry: [
          { terminal_id: 'COUNTER-01', is_active: false, is_default: true }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(multipleDefaultsReq, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);

    res.status.mockClear();
    res.json.mockClear();
    validateUpdateSettings(inactiveDefaultReq, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('accepts terminal registry updates on single-setting route', () => {
    const req = {
      params: { key: 'pos_terminal_registry' },
      body: {
        value: [
          { terminal_id: 'COUNTER-02', label: 'Back Counter', is_active: true, is_default: true }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.value[0].terminal_id).toBe('COUNTER-02');
  });

  it('accepts terminal registry mode and normalizes lowercase values', () => {
    const req = {
      body: {
        pos_terminal_registry_mode: 'enforce'
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData.pos_terminal_registry_mode).toBe('enforce');
  });

  it('rejects unsupported terminal registry mode values', () => {
    const req = {
      body: {
        pos_terminal_registry_mode: 'strict'
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });
});
