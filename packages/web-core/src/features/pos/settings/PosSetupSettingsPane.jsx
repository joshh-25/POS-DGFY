import { useState } from 'react';
import PosSetupSubTabs from './PosSetupSubTabs.jsx';
import PosBusinessReceiptsSection from './PosBusinessReceiptsSection.jsx';
import PosOperationsAccessSection from './PosOperationsAccessSection.jsx';
import PosTerminalSettingsSection from './PosTerminalSettingsSection.jsx';
import PosDiscountAutomationSection from './PosDiscountAutomationSection.jsx';

const EDITOR_SETUP_SECTIONS = {
  pos: ['operations', 'controls'],
  attendance: ['operations'],
  team: ['operations'],
  registers: ['terminals'],
  terminal_setup: ['operations']
};

export default function PosSetupSettingsPane({
  terminalUser,
  queueLocationScopeId,
  posSetupDirty = false,
  editorSection = '',
  visibleSectionIds = null,
  showTerminalRegistryEditor = true,
  showTerminalOnlyControls = false,
  showPosDefaultsEditor = true,
  showAttendanceEditor = true,
  showTeamAccessEditor = true,
  ...props
}) {
  const scopedSectionIds = Array.isArray(visibleSectionIds)
    ? visibleSectionIds
    : (EDITOR_SETUP_SECTIONS[editorSection] || null);
  const [activeSection, setActiveSection] = useState(scopedSectionIds?.[0] || 'business');
  const resolvedActiveSection = scopedSectionIds?.includes(activeSection)
    ? activeSection
    : (scopedSectionIds?.[0] || activeSection);
  const showSectionNavigation = !scopedSectionIds || scopedSectionIds.length > 1;
  const paneProps = {
    terminalUser,
    queueLocationScopeId,
    editorSection,
    showTerminalRegistryEditor,
    showTerminalOnlyControls,
    showPosDefaultsEditor,
    showAttendanceEditor,
    showTeamAccessEditor,
    ...props
  };

  const renderPanel = (sectionId, content) => {
    if (scopedSectionIds) {
      return scopedSectionIds.includes(sectionId) && resolvedActiveSection === sectionId
        ? (
          <div
            id={`pos-setup-panel-${sectionId}`}
            role="tabpanel"
            aria-labelledby={`pos-setup-tab-${sectionId}`}
            className="min-w-0"
          >
            {content}
          </div>
        )
        : null;
    }

    return (
      <div
        id={`pos-setup-panel-${sectionId}`}
        role="tabpanel"
        aria-labelledby={`pos-setup-tab-${sectionId}`}
        hidden={activeSection !== sectionId}
        className="min-w-0"
      >
        {content}
      </div>
    );
  };

  return (
    <div className={`grid min-w-0 gap-6 ${posSetupDirty ? 'pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pb-20' : 'pb-6 sm:pb-8'}`}>
      {showSectionNavigation ? (
        <PosSetupSubTabs
          activeSection={resolvedActiveSection}
          onChange={setActiveSection}
          visibleSectionIds={scopedSectionIds}
        />
      ) : null}

      {renderPanel('business', <PosBusinessReceiptsSection {...paneProps} />)}
      {renderPanel('operations', <PosOperationsAccessSection {...paneProps} />)}
      {renderPanel('terminals', <PosTerminalSettingsSection {...paneProps} />)}
      {renderPanel('controls', <PosDiscountAutomationSection {...paneProps} />)}

    </div>
  );
}
