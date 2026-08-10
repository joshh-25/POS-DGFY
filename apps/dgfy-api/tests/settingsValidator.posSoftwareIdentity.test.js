import { describe, expect, it, jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const buildResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
  return res;
};

describe('settings validator POS software identity contract', () => {
  it('rejects tenant bulk settings payloads that include platform-controlled POS software identity', () => {
    const req = {
      body: {
        pos_software_name: 'Custom POS'
      }
    };
    const res = buildResponse();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].errors[0].message).toContain('configured by platform admin');
  });

  it('rejects tenant single-setting payloads for platform-controlled POS software identity', () => {
    const req = {
      params: { key: 'pos_software_serial_number' },
      body: { value: 'SN-001' }
    };
    const res = buildResponse();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].errors[0]).toEqual(expect.objectContaining({
      field: 'key',
      message: expect.stringContaining('configured by platform admin')
    }));
  });
});
