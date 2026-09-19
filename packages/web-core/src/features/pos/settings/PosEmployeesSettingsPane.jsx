import { useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, Truck, Users } from 'lucide-react';
import EmployeeCreditManagementPanel from '../components/EmployeeCreditManagementPanel.jsx';
import EmployeeManagementPanel from '../components/EmployeeManagementPanel.jsx';
import DeliveryPersonnelManagementPanel from '../components/DeliveryPersonnelManagementPanel.jsx';

const EMPLOYEE_SETTINGS_TABS = [
  { id: 'employees', label: 'Employees', icon: Users, permission: 'canManageEmployees' },
  { id: 'delivery-personnel', label: 'Delivery Personnel', icon: Truck, permission: 'canManageDeliveryPersonnel' },
  { id: 'employee-credit', label: 'Employee Credit', icon: CreditCard, permission: 'canManageEmployeeCredit' }
];

export default function PosEmployeesSettingsPane({
  canManageEmployees,
  canManageDeliveryPersonnel,
  canManageEmployeeCredit,
  locked,
  loading,
  employeeDirectoryRevision,
  onEmployeesChanged,
  onDeliveryPersonnelChanged
}) {
  const availableTabs = useMemo(() => EMPLOYEE_SETTINGS_TABS.filter((tab) => Boolean({
    canManageEmployees,
    canManageDeliveryPersonnel,
    canManageEmployeeCredit
  }[tab.permission])), [canManageDeliveryPersonnel, canManageEmployeeCredit, canManageEmployees]);
  const [activeTab, setActiveTab] = useState(availableTabs[0]?.id || '');
  const employeeRefreshActionRef = useRef(null);
  const deliveryPersonnelRefreshActionRef = useRef(null);
  const employeeCreditRefreshActionRef = useRef(null);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id || '');
    }
  }, [activeTab, availableTabs]);

  const handleTabKeyDown = (event) => {
    const currentIndex = availableTabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex < 0 || availableTabs.length < 2) return;

    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % availableTabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = availableTabs.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = availableTabs[nextIndex];
    setActiveTab(nextTab.id);
    requestAnimationFrame(() => {
      document.getElementById(`pos-employees-tab-${nextTab.id}`)?.focus();
    });
  };

  if (availableTabs.length === 0) return null;

  const panels = {
    employees: (
      <EmployeeManagementPanel
        disabled={locked || loading}
        onEmployeesChanged={onEmployeesChanged}
        refreshActionRef={employeeRefreshActionRef}
      />
    ),
    'delivery-personnel': (
      <DeliveryPersonnelManagementPanel
        disabled={locked || loading}
        onDeliveryPersonnelChanged={onDeliveryPersonnelChanged}
        refreshActionRef={deliveryPersonnelRefreshActionRef}
      />
    ),
    'employee-credit': (
      <EmployeeCreditManagementPanel
        disabled={locked || loading}
        refreshKey={employeeDirectoryRevision}
        refreshActionRef={employeeCreditRefreshActionRef}
      />
    )
  };

  return (
    <div className="grid min-w-0 max-w-full gap-6 sm:gap-4">
      {availableTabs.length > 1 ? (
        <div
          className="-mx-1 overflow-x-auto"
          role="tablist"
          aria-label="Employee settings sections"
        >
          <div className="flex min-w-max gap-2 px-1 min-[1200px]:grid min-[1200px]:min-w-0 min-[1200px]:grid-cols-3 min-[1200px]:px-0">
            {availableTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  id={`pos-employees-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`pos-employees-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={handleTabKeyDown}
                  className={`inline-flex min-h-10 min-w-36 w-max shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-2 text-center text-[13px] font-bold leading-4 shadow-sm transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 focus-visible:ring-offset-1 sm:px-3 sm:text-[14px] min-[1200px]:min-h-9 min-[1200px]:w-full min-[1200px]:shrink min-[1200px]:px-4 ${
                    isActive
                      ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-[#1A4E8D]/20 hover:bg-[#164278]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-[#9BBBE0] hover:bg-[#F5F9FF] hover:text-[#1A4E8D]'
                  }`}
                >
                  <TabIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="min-w-0">
        {availableTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <div
              key={tab.id}
              id={`pos-employees-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={availableTabs.length > 1 ? `pos-employees-tab-${tab.id}` : undefined}
              tabIndex={isActive ? 0 : -1}
              hidden={!isActive}
              className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20 focus-visible:ring-offset-2"
            >
              {panels[tab.id]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
