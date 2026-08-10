import { describe, expect, it, jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const buildResponse = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
    return res;
};

// ADR 0053: pos_hardware_profile is a client-side hardware preference, never a
// server-dispatch override — see the schema comment in settingsValidator.js.
describe('settings validator pos_hardware_profile contract', () => {
    it('accepts a valid hardware profile and fills in defaults', () => {
        const req = {
            body: {
                pos_hardware_profile: { driver_preference: 'imin_native' }
            }
        };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.pos_hardware_profile).toEqual({
            driver_preference: 'imin_native',
            paper_width: '80mm',
            auto_open_drawer: true
        });
    });

    it('rejects an unrecognized driver preference', () => {
        const req = {
            body: {
                pos_hardware_profile: { driver_preference: 'some_random_printer' }
            }
        };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts pos_hardware_profile through the single-setting update route', () => {
        const req = {
            params: { key: 'pos_hardware_profile' },
            body: { value: { driver_preference: 'none', paper_width: '57mm', auto_open_drawer: false } }
        };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSingleSetting(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });
});
