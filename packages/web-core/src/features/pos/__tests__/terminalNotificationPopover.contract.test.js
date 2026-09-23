import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const layoutSource = fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos/components/TerminalPageLayout.jsx'),
  'utf8'
);

describe('POS notification popover layout contract', () => {
  it('anchors the notification panel inside the header viewport', () => {
    expect(layoutSource).toContain(
      'absolute right-0 top-full z-[121] mt-3.5 w-[21rem] max-w-[calc(100vw-2rem)] translate-x-0 text-left'
    );
    expect(layoutSource).not.toContain(
      'absolute left-1/2 top-full z-[121] mt-3.5 w-[21rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 text-left'
    );
  });

  it('keeps the notification pointer aligned near the triggering bell', () => {
    expect(layoutSource).toContain(
      'absolute right-3 top-0 z-10 h-5 w-5 -translate-y-[62%] rotate-45 border-l border-t border-blue-200 bg-[#1A4E8D]'
    );
    expect(layoutSource).not.toContain('absolute left-1/2 top-0 z-10 h-5 w-5');
  });

  it('keeps the compact mobile/tablet notification count inside the bell control', () => {
    expect(layoutSource).toContain(
      "absolute right-0.5 top-0.5 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 px-0 text-[9px] font-black leading-none text-white"
    );
    expect(layoutSource).toContain('data-testid="pos-notification-badge"');
    expect(layoutSource).not.toContain('absolute -right-1.5 -top-1.5 grid h-4.5 w-4.5');
  });
});
