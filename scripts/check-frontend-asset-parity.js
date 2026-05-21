#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const fail = (message) => {
  console.error(`[frontend-asset-parity] FAIL: ${message}`);
  process.exit(1);
};

const log = (message) => {
  console.log(`[frontend-asset-parity] ${message}`);
};

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
};

const label = getArgValue('--label') || 'surface';
const localIndexPath = getArgValue('--local-index');
const publicUrl = getArgValue('--public-url');

if (!localIndexPath) fail('Missing --local-index');
if (!publicUrl) fail('Missing --public-url');

const absoluteLocalIndex = path.resolve(process.cwd(), localIndexPath);
if (!fs.existsSync(absoluteLocalIndex)) {
  fail(`Local index file not found: ${absoluteLocalIndex}`);
}

const extractRefs = (html) => {
  const scriptRefs = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  const cssRefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi)].map((m) => m[1]);
  const manifestRef = (html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/i) || [])[1] || null;

  const entryScriptRef = scriptRefs.find((ref) => /assets\/.+\.js(\?|$)/i.test(ref)) || null;
  const entryCssRef = cssRefs.find((ref) => /assets\/.+\.css(\?|$)/i.test(ref)) || null;

  return {
    entryScriptRef,
    entryCssRef,
    manifestRef
  };
};

const basenameFromRef = (ref) => {
  if (!ref) return null;
  const withoutQuery = String(ref).split('?')[0].split('#')[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : null;
};

const assertEqualBasename = ({ artifact, localRef, publicRef }) => {
  const localBase = basenameFromRef(localRef);
  const publicBase = basenameFromRef(publicRef);

  if (!localBase) {
    fail(`${label}: local ${artifact} reference not found in ${absoluteLocalIndex}`);
  }
  if (!publicBase) {
    fail(`${label}: served ${artifact} reference not found in ${publicUrl}`);
  }
  if (localBase !== publicBase) {
    fail(`${label}: ${artifact} mismatch. local=${localBase} served=${publicBase}`);
  }
};

const localHtml = fs.readFileSync(absoluteLocalIndex, 'utf8');
const localRefs = extractRefs(localHtml);

const fetchText = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    fail(`${label}: failed to fetch ${url} (HTTP ${response.status})`);
  }
  return response.text();
};

const run = async () => {
  const publicHtml = await fetchText(publicUrl);
  const publicRefs = extractRefs(publicHtml);

  assertEqualBasename({
    artifact: 'entry script',
    localRef: localRefs.entryScriptRef,
    publicRef: publicRefs.entryScriptRef
  });

  if (localRefs.entryCssRef || publicRefs.entryCssRef) {
    assertEqualBasename({
      artifact: 'entry stylesheet',
      localRef: localRefs.entryCssRef,
      publicRef: publicRefs.entryCssRef
    });
  }

  if (localRefs.manifestRef || publicRefs.manifestRef) {
    assertEqualBasename({
      artifact: 'manifest',
      localRef: localRefs.manifestRef,
      publicRef: publicRefs.manifestRef
    });
  }

  log(`PASS: ${label} parity matched (${publicUrl})`);
};

run().catch((error) => {
  fail(`${label}: unexpected error: ${error?.message || error}`);
});

