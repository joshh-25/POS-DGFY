import { useState } from 'react';
import PosSetupSubTabs from './PosSetupSubTabs.jsx';
import PosBusinessReceiptsSection from './PosBusinessReceiptsSection.jsx';
import PosOperationsAccessSection from './PosOperationsAccessSection.jsx';
import PosTerminalSettingsSection from './PosTerminalSettingsSection.jsx';
import PosDiscountAutomationSection from './PosDiscountAutomationSection.jsx';

export default function PosSetupSettingsPane({
  terminalUser,
  queueLocationScopeId,
  posSetupDirty = false,
  ...props
}) {
  const [activeSection, setActiveSection] = useState('business');
  const paneProps = { terminalUser, queueLocationScopeId, ...props };

  return (
    <div className={`grid min-w-0 gap-6 ${posSetupDirty ? 'pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pb-20' : 'pb-6 sm:pb-8'}`}>
      <PosSetupSubTabs activeSection={activeSection} onChange={setActiveSection} />

      <div
        id="pos-setup-panel-business"
        role="tabpanel"
        aria-labelledby="pos-setup-tab-business"
        hidden={activeSection !== 'business'}
        className="min-w-0"
      >
        <PosBusinessReceiptsSection {...paneProps} />
      </div>
      <div
        id="pos-setup-panel-operations"
        role="tabpanel"
        aria-labelledby="pos-setup-tab-operations"
        hidden={activeSection !== 'operations'}
        className="min-w-0"
      >
        <PosOperationsAccessSection {...paneProps} />
      </div>
      <div
        id="pos-setup-panel-terminals"
        role="tabpanel"
        aria-labelledby="pos-setup-tab-terminals"
        hidden={activeSection !== 'terminals'}
        className="min-w-0"
      >
        <PosTerminalSettingsSection {...paneProps} />
      </div>
      <div
        id="pos-setup-panel-controls"
        role="tabpanel"
        aria-labelledby="pos-setup-tab-controls"
        hidden={activeSection !== 'controls'}
        className="min-w-0"
      >
        <PosDiscountAutomationSection {...paneProps} />
      </div>

    </div>
  );
}
