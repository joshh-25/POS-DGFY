import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { resolveSigningKeyMaterial } from '../src/modules/shared/utils/oidcSigningKeyResolver.js';

describe('resolveSigningKeyMaterial', () => {
  let directory;
  let filePath;
  let originalWarn;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oidc-key-resolver-'));
    filePath = path.join(directory, 'signing.pem');
    originalWarn = console.warn;
    console.warn = jest.fn();
    delete process.env.TEST_OIDC_INLINE;
    delete process.env.TEST_OIDC_FILE;
  });

  afterEach(() => {
    console.warn = originalWarn;
    delete process.env.TEST_OIDC_INLINE;
    delete process.env.TEST_OIDC_FILE;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const resolve = () => resolveSigningKeyMaterial({
    inlineEnvVar: 'TEST_OIDC_INLINE',
    fileEnvVar: 'TEST_OIDC_FILE',
    label: 'test key'
  });

  test('uses inline material before a configured file', () => {
    process.env.TEST_OIDC_INLINE = 'inline-pem';
    process.env.TEST_OIDC_FILE = path.join(directory, 'missing.pem');

    expect(resolve()).toEqual({ pem: 'inline-pem', source: 'inline', filePath: null, errorCode: null });
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('returns unset when neither source is configured', () => {
    expect(resolve()).toEqual({ pem: '', source: 'unset', filePath: null, errorCode: null });
  });

  test('reads and trims a key file', () => {
    fs.writeFileSync(filePath, '  pem-material\n');
    process.env.TEST_OIDC_FILE = filePath;

    expect(resolve()).toEqual({ pem: 'pem-material', source: 'file', filePath, errorCode: null });
  });

  test('reports empty files without logging their contents', () => {
    fs.writeFileSync(filePath, '  \n');
    process.env.TEST_OIDC_FILE = filePath;

    expect(resolve()).toEqual({ pem: '', source: 'empty_file', filePath, errorCode: 'EMPTY_FILE' });
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ filePath, errorCode: 'EMPTY_FILE' }));
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain('pem-material');
  });

  test('reports a missing file with its error code and no key material', () => {
    const pem = crypto.randomBytes(16).toString('hex');
    process.env.TEST_OIDC_INLINE = '';
    process.env.TEST_OIDC_FILE = path.join(directory, 'missing.pem');

    expect(resolve()).toMatchObject({ pem: '', source: 'unreadable', errorCode: 'ENOENT' });
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain(pem);
  });
});
