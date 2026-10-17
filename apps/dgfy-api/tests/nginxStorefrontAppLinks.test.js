import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const expectedAppIds = [
  '4JDU3J7T75.com.dgfy.storefront',
  '4JDU3J7T75.com.dgfy.storefront.staging',
  '4JDU3J7T75.com.dgfy.storefront.dev'
];

const expectedComponents = [
  { '/': '/tenant-store/*' },
  { '/': '/store/*' }
];

function extractBraceBlock(source, openingBraceIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const character = source[index];

    if (inComment) {
      if (character === '\n') inComment = false;
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '#') {
      inComment = true;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBraceIndex, index + 1);
    }
  }

  throw new Error('Unclosed nginx configuration block');
}

function extractServerBlock(source, serverName) {
  const marker = `server_name ${serverName};`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Missing nginx server_name: ${serverName}`);

  const serverStart = source.lastIndexOf('server {', markerIndex);
  if (serverStart === -1) throw new Error(`Missing server block for ${serverName}`);

  const openingBraceIndex = source.indexOf('{', serverStart);
  return extractBraceBlock(source, openingBraceIndex);
}

function extractExactLocation(serverBlock, uri) {
  const marker = `location = ${uri} {`;
  const locationStart = serverBlock.indexOf(marker);
  if (locationStart === -1) throw new Error(`Missing exact nginx location for ${uri}`);

  const openingBraceIndex = serverBlock.indexOf('{', locationStart);
  return extractBraceBlock(serverBlock, openingBraceIndex);
}

function parseReturnedJson(locationBlock) {
  const match = locationBlock.match(/\breturn\s+200\s+'([^']*)';/);
  if (!match) throw new Error('Expected a single-quoted nginx return 200 JSON body');
  return JSON.parse(match[1]);
}

describe('Storefront app-link association responses', () => {
  const nginxTemplate = read('infrastructure/docker/nginx/nginx.conf.template');
  const storefrontServer = extractServerBlock(nginxTemplate, '${STOREFRONT_DOMAIN_PROD}');

  it('serves both association files from exact locations before the SPA catch-all', () => {
    const aasaIndex = storefrontServer.indexOf('location = /.well-known/apple-app-site-association {');
    const assetlinksIndex = storefrontServer.indexOf('location = /.well-known/assetlinks.json {');
    const catchAllIndex = storefrontServer.indexOf('location / {');

    expect(aasaIndex).toBeGreaterThanOrEqual(0);
    expect(assetlinksIndex).toBeGreaterThan(aasaIndex);
    expect(catchAllIndex).toBeGreaterThan(assetlinksIndex);
  });

  it('serves the AASA JSON for the production, staging, and development Storefront apps', () => {
    const location = extractExactLocation(storefrontServer, '/.well-known/apple-app-site-association');
    const body = parseReturnedJson(location);

    expect(body).toEqual({
      applinks: {
        details: [{ appIDs: expectedAppIds, components: expectedComponents }]
      }
    });
    for (const appId of body.applinks.details[0].appIDs) {
      expect(appId).toMatch(/^4JDU3J7T75\.com\.dgfy\.storefront(?:\.staging|\.dev)?$/);
    }
  });

  it('serves a valid Digital Asset Links list and validates any supplied signing fingerprints', () => {
    const location = extractExactLocation(storefrontServer, '/.well-known/assetlinks.json');
    const statements = parseReturnedJson(location);

    expect(Array.isArray(statements)).toBe(true);
    if (statements.length === 0) {
      // No Play Console fingerprints were available when this handoff was finalized.
      expect(statements).toEqual([]);
      return;
    }

    expect(statements.map(({ target }) => target.package_name)).toEqual([
      'com.dgfy.storefront',
      'com.dgfy.storefront.staging',
      'com.dgfy.storefront.dev'
    ]);

    for (const statement of statements) {
      expect(statement.relation).toEqual(['delegate_permission/common.handle_all_urls']);
      expect(statement.target.namespace).toBe('android_app');
      expect(statement.target.package_name).toMatch(
        /^com\.dgfy\.storefront(?:\.staging|\.dev)?$/
      );
      expect(Array.isArray(statement.target.sha256_cert_fingerprints)).toBe(true);
      expect(statement.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
      for (const fingerprint of statement.target.sha256_cert_fingerprints) {
        expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      }
    }
  });

  it('sets JSON content type and short public caching without proxy, SPA, or redirect behavior', () => {
    for (const uri of [
      '/.well-known/apple-app-site-association',
      '/.well-known/assetlinks.json'
    ]) {
      const location = extractExactLocation(storefrontServer, uri);
      expect(location).toMatch(/\bdefault_type\s+application\/json\s*;/);
      expect(location).toMatch(/\badd_header\s+Cache-Control\s+"public, max-age=300"\s*;/);
      expect(location).not.toMatch(/\b(?:proxy_pass|try_files)\b/);
      expect(location).not.toMatch(/\breturn\s+30\d\b/);
    }
  });
});
