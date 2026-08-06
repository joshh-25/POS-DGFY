import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Deliberately outside src/features/pos/ -- this is a pure infra/nginx
// contract, not POS logic, so it must not drag in the compliance gate
// that apps/dgfy-web/src/features/pos/** triggers.
const CONF_DIR = path.resolve(process.cwd(), '../../infrastructure/docker/frontend/conf.d');
const APPS = ['pos', 'store', 'skupervisor'];

const readConf = (app) => fs.readFileSync(path.join(CONF_DIR, `${app}.conf`), 'utf8');

describe('frontend container nginx asset cache policy (issue #182)', () => {
  it.each(APPS)('%s.conf serves hashed assets as immutable and rejects missing ones with a real 404', (app) => {
    const source = readConf(app);

    // A missing hashed chunk must 404 here rather than falling through to
    // the SPA rewrite below -- the SPA rewrite would answer with
    // index.html (200 text/html), which the browser can't evaluate as a
    // module and which the service worker would cache AS the script.
    expect(source).toContain('location /assets/');
    expect(source).toContain('try_files $uri =404;');
    expect(source).toContain('Cache-Control "public, max-age=31536000, immutable"');
  });

  it.each(APPS)('%s.conf revalidates the SPA shell on every load', (app) => {
    const source = readConf(app);

    // `no-cache`, not `no-store`: the service worker's isCacheableResponse
    // only rejects `no-store`, so `no-store` here would stop it caching
    // the unhashed shell/icon assets for offline use.
    expect(source).toContain('try_files $uri $uri/ /index.html;');
    expect(source).toContain('Cache-Control "no-cache"');
    // `no-store` (as an actual directive value, not the explanatory
    // comment above it) would stop the service worker caching the shell
    // for offline use -- see isCacheableResponse in each app's sw.js.
    expect(source).not.toContain('Cache-Control "no-store"');
  });

  it.each(APPS)('%s.conf does not mark a 404 as immutable (no `always` on the asset header)', (app) => {
    const source = readConf(app);
    const assetsBlock = source.slice(source.indexOf('location /assets/'), source.indexOf('location /', source.indexOf('location /assets/') + 1));

    expect(assetsBlock).not.toContain('add_header Cache-Control "public, max-age=31536000, immutable" always;');
  });
});
