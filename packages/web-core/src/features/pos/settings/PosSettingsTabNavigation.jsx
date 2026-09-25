import PosLineTabNavigation from '../components/PosLineTabNavigation.jsx';
import { POS_MOBILE_STICKY_TAB_ROW_CLASS } from '../components/PosPageSpacing.js';

export default function PosSettingsTabNavigation({ tabs, activeTab, onTabChange }) {
  return (
    <div
      data-testid="pos-settings-sticky-tabs"
      className={`min-w-0 ${POS_MOBILE_STICKY_TAB_ROW_CLASS}`}
    >
      <PosLineTabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        ariaLabel="Settings sections"
        idPrefix="pos-settings-tab"
        panelId="pos-settings-panel"
      />
    </div>
  );
}
