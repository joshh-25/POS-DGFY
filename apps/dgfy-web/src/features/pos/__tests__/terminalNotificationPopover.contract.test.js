import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/features/pos/components/TerminalPageLayout.jsx'),
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
});
