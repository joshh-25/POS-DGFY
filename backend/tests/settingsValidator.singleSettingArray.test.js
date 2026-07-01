import { jest } from '@jest/globals';
import { validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('settings validator single-setting payload', () => {
  it('accepts array value payload (for json settings like pos_discount_profiles)', () => {
    const req = {
      body: {
        value: [
          { name: 'Employee Discount', percentage: 20, active: true }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(Array.isArray(req.validatedData.value)).toBe(true);
  });

  it('rejects missing value payload', () => {
    const req = { body: {} };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('accepts structured storefront_hours with a long generated display for repository normalization', () => {
    const longDisplay = Array.from({ length: 8 }, (_, index) => `Segment ${index + 1} 6:00 AM - 10:00 AM`).join('; ');
    const day = {
      enabled: true,
      open: '06:00',
      close: '22:00',
      intervals: [
        { open: '06:00', close: '10:00' },
        { open: '11:00', close: '15:00' },
        { open: '16:00', close: '22:00' }
      ]
    };
    const req = {
      params: { key: 'storefront_hours' },
      body: {
        value: {
          mode: 'weekly',
          timezone: 'Asia/Manila',
          weekly: {
            sun: day,
            mon: day,
            tue: day,
            wed: day,
            thu: day,
            fri: day,
            sat: day
          },
          display: longDisplay
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(longDisplay.length).toBeGreaterThan(120);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.value.display).toBe(longDisplay);
  });

  it('rejects unsupported method keys when updating pos_order_method_fees via single-setting route', () => {
    const req = {
      params: { key: 'pos_order_method_fees' },
      body: {
        value: {
          dine_in: { enabled: true, amount: 0, label: 'Dine In Fee' },
          express_delivery: { enabled: true, amount: 50, label: 'Express Fee' }
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('accepts storefront_gallery_images when each entry has url or path', () => {
    const req = {
      params: { key: 'storefront_gallery_images' },
      body: {
        value: [
          { path: 'storefront-assets/t1/gallery-1.png', caption: 'Featured dish' },
          { url: 'https://cdn.example.com/storefront/t1/gallery-2.jpg', alt: 'Store interior' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(Array.isArray(req.validatedData.value)).toBe(true);
  });

  it('accepts storefront_gallery_images with uploaded backend-local image URLs', () => {
    const req = {
      params: { key: 'storefront_gallery_images' },
      body: {
        value: [
          {
            url: '/uploads/storefront-assets/t1/gallery-uploaded.png',
            path: 'storefront-assets/t1/gallery-uploaded.png',
            caption: 'Uploaded dish'
          }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.value[0]).toEqual(expect.objectContaining({
      url: '/uploads/storefront-assets/t1/gallery-uploaded.png',
      path: 'storefront-assets/t1/gallery-uploaded.png'
    }));
  });

  it('rejects storefront_gallery_images entries that have neither url nor path', () => {
    const req = {
      params: { key: 'storefront_gallery_images' },
      body: {
        value: [
          { caption: 'Broken gallery row' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects storefront_gallery_images entries with unsafe url values', () => {
    const req = {
      params: { key: 'storefront_gallery_images' },
      body: {
        value: [
          { url: 'javascript:alert(1)', caption: 'Unsafe url' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects storefront_gallery_images entries with invalid path values', () => {
    const req = {
      params: { key: 'storefront_gallery_images' },
      body: {
        value: [
          { path: '../outside/gallery.jpg', caption: 'Invalid path' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('accepts storefront_delivery_partners with valid https links', () => {
    const req = {
      params: { key: 'storefront_delivery_partners' },
      body: {
        value: [
          { partner: 'grab', label: 'Grab', url: 'https://grab.com/ph/' },
          { partner: 'custom', label: 'Bike Courier', url: 'https://courier.example.com' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects storefront_delivery_partners entries with non-http(s) links', () => {
    const req = {
      params: { key: 'storefront_delivery_partners' },
      body: {
        value: [
          { partner: 'custom', label: 'Unsafe', url: 'javascript:alert(1)' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });
});
