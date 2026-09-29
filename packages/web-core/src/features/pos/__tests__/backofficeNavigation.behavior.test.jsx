// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const terminalPageSource = readSource('../pages/TerminalPage.jsx');
const terminalPageLayoutSource = readSource('../components/TerminalPageLayout.jsx');
const terminalPageDialogLayerSource = readSource('../components/TerminalPageDialogLayer.jsx');
const terminalLockDrawerSource = readSource('../components/TerminalLockDrawer.jsx');
const terminalWorkspaceSidebarSource = readSource('../components/TerminalWorkspaceSidebar.jsx');
const posEntrySource = readSource('../../../../../../apps/dgfy-pos/src/main.jsx');

afterEach(() => cleanup());

describe('POS Back Office boundary', () => {
  it('keeps POS routes and terminal navigation free of Back Office or OPIS handoffs', () => {
    expect(posEntrySource).toContain('<Route path="/sales" element={<SkupervisorSalesRedirect />} />');
    expect(posEntrySource).not.toMatch(/backoffice|business-admin|opis/i);
    expect(terminalPageSource).not.toMatch(/backoffice|business-admin|opis/i);
    expect(terminalPageLayoutSource).not.toMatch(/onOpenBackOffice|canLaunchBackOffice/i);
    expect(terminalPageDialogLayerSource).not.toMatch(/backOfficeConfirm|Open Back Office|OPIS/i);
    expect(terminalLockDrawerSource).not.toMatch(/onOpenBackOffice|Back Office|OPIS/i);
    expect(terminalWorkspaceSidebarSource).not.toMatch(/Back Office|OPIS|canLaunchBackOffice|onOpenBackOffice/i);
  });

  it('keeps POS Settings available without a Business Admin capability', () => {
    render(
      <TerminalWorkspaceSidebar
        locked={false}
        isOnline
        terminalUser={{ role: 'admin' }}
        currentViewMode="checkout"
        canViewPos
        shiftState={{ shift: { pos_terminal_shift_id: 12, location_id: 3 } }}
      />
    );

    expect(screen.getByTestId('pos-nav-settings')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-backoffice')).toBeNull();
  });
});
