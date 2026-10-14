import { isSecureAdminCredentialRequest } from '../src/modules/contactInquiries/domain/pin4msCredentialTransport.js';

describe('Pin4MS credential transport policy', () => {
  test('accepts an HTTPS request', () => {
    expect(isSecureAdminCredentialRequest({ secure: true, hostname: 'admin.dgfy.ph', ip: '203.0.113.8' })).toBe(true);
  });

  test.each([
    ['localhost', '127.0.0.1'],
    ['127.0.0.1', '::1'],
    ['[::1]', '::ffff:127.0.0.1']
  ])('accepts loopback development request from %s via %s', (hostname, ip) => {
    expect(isSecureAdminCredentialRequest({ secure: false, hostname, ip })).toBe(true);
  });

  test.each([
    { secure: false, hostname: '10.123.35.127', ip: '10.123.35.45' },
    { secure: false, hostname: 'localhost', ip: '10.123.35.45' },
    { secure: false, hostname: 'admin.dgfy.ph', ip: '127.0.0.1' }
  ])('rejects a non-secure non-loopback request', (request) => {
    expect(isSecureAdminCredentialRequest(request)).toBe(false);
  });
});
