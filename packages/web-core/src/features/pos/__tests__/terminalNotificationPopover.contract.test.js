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
  it('centers the POS notification panel below compact headers and preserves desktop anchoring', () => {
    expect(layoutSource).toContain(
      "? 'fixed left-1/2 top-[3.875rem] z-[121] w-[21rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 text-left lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-3.5 lg:translate-x-0'"
    );
    expect(layoutSource).toContain(
      ": 'absolute right-0 top-full z-[121] mt-3.5 w-[21rem] max-w-[calc(100vw-2rem)] translate-x-0 text-left'"
    );
    expect(layoutSource).toContain('className={notificationPopoverPositionClassName}');
  });

  it('hides the pointer while the POS popover is viewport-centered', () => {
    expect(layoutSource).toContain(
      '`${notificationPopoverClasses.pointer} hidden lg:block`'
    );
    expect(layoutSource).toContain('className={notificationPopoverPointerClassName}');
  });

  it('keeps the desktop notification pointer aligned near the triggering bell', () => {
    expect(layoutSource).toContain(
      "pointer: 'absolute right-3 top-0 z-10 h-5 w-5 -translate-y-[62%] rotate-45 border-l border-t border-blue-200 bg-[#EFF6FF]'"
    );
    expect(layoutSource).toContain(
      "pointer: 'absolute right-3 top-0 z-10 h-5 w-5 -translate-y-[62%] rotate-45 border-l border-t border-blue-200 bg-[#1A4E8D]'"
    );
    expect(layoutSource).not.toContain('absolute left-1/2 top-0 z-10 h-5 w-5');
  });

  it('uses the reference light treatment on POS while preserving other-surface styles', () => {
    expect(layoutSource).toContain('const notificationPopoverClasses = IS_DGFY_POS_SURFACE');
    expect(layoutSource).toContain(
      "header: 'border-b border-blue-100 bg-[#EFF6FF] px-5 py-4'"
    );
    expect(layoutSource).toContain(
      "footerAction: 'block w-full text-center text-xs font-bold text-[#2563EB]"
    );
    expect(layoutSource).toContain(
      "header: 'bg-gradient-to-r from-[#1A4E8D] to-[#2563EB] px-4 py-3 text-white'"
    );
    expect(layoutSource).toContain(
      "border border-blue-200 bg-blue-50 text-[#1A4E8D] transition-colors hover:bg-blue-100"
    );
  });

  it('uses a 12px corner radius and smaller type on the POS notification popover', () => {
    expect(layoutSource).toContain(
      "panel: 'overflow-hidden rounded-[12px] border border-blue-200 bg-white shadow-xl shadow-slate-950/10'"
    );
    expect(layoutSource).toContain("title: 'text-sm font-extrabold text-[#0F172A]'");
    expect(layoutSource).toContain("subtitle: 'mt-1 text-[11px] leading-4 text-[#64748B]'");
    expect(layoutSource).toContain("itemTitle: 'text-xs font-extrabold text-[#0F172A]'");
    expect(layoutSource).toContain("itemDescription: 'mt-1 text-[11px] leading-4 text-[#64748B]'");
    expect(layoutSource).toContain('itemAction: \'mt-2 inline-flex text-[11px] font-bold uppercase tracking-wide text-[#2563EB]\'');
    expect(layoutSource).toContain("emptyTitle: 'text-xs font-semibold text-[#0F172A]'");
    expect(layoutSource).toContain("emptyDescription: 'mt-1 text-[11px] text-[#64748B]'");
    expect(layoutSource).toContain("footerAction: 'block w-full text-center text-xs font-bold text-[#2563EB]");
    expect(layoutSource).not.toContain("panel: 'overflow-hidden rounded-3xl border border-blue-200");
  });

  it('keeps the live order count and current Incoming Queue actions', () => {
    expect(layoutSource).toContain("title: `${incomingOrders.length} incoming order${incomingOrders.length === 1 ? '' : 's'}`");
    expect(layoutSource).toContain("actionLabel: 'Open Orders'");
    expect(layoutSource).toContain("handleSelectViewMode('incoming_queue')");
    expect(layoutSource).toContain('Show all notifications');
  });

  it('keeps POS notification and text controls the same size across breakpoints', () => {
    expect(layoutSource).toContain(
      "'dgfy-pos-header-action-slot relative grid h-10 w-10 shrink-0 place-items-center lg:hidden'"
    );
    expect(layoutSource).toContain(
      "'dgfy-pos-header-action-slot relative hidden h-10 w-10 shrink-0 place-items-center lg:grid'"
    );
    expect(layoutSource).toContain(
      "'dgfy-pos-header-action-trigger relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-[#1A4E8D] transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-1'"
    );
    expect(layoutSource).toContain('renderNotificationButton(compactBellClassName, 20)');
    expect(layoutSource).toContain(
      'renderNotificationButton(desktopBellClassName, IS_DGFY_POS_SURFACE ? 20 : 24)'
    );
    expect(layoutSource).toContain(
      "absolute right-0.5 top-0.5 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 px-0 text-[9px] font-black leading-none text-white"
    );
    expect(layoutSource).toContain('data-testid="pos-notification-badge"');
  });
});
