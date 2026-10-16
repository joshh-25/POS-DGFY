import { SlidersHorizontal, UsersRound, WalletCards } from 'lucide-react';

const tabs = [
    { id: 'list', label: 'Affiliates List', icon: UsersRound },
    { id: 'cashout', label: 'Cashout', icon: WalletCards },
    { id: 'settings', label: 'Settings', icon: SlidersHorizontal }
];

export default function AffiliateSecondaryNav({ activeTab, onChange, canSeeCashoutQueue }) {
    const visibleTabs = tabs.filter(({ id }) => id !== 'cashout' || canSeeCashoutQueue);

    const handleTabKeyDown = (event, currentTabId) => {
        const currentIndex = visibleTabs.findIndex(({ id }) => id === currentTabId);
        if (currentIndex < 0) return;

        let nextIndex = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % visibleTabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = visibleTabs.length - 1;
        if (nextIndex == null) return;

        event.preventDefault();
        const nextTab = visibleTabs[nextIndex];
        onChange(nextTab.id);
        requestAnimationFrame(() => document.getElementById(`affiliate-tab-${nextTab.id}`)?.focus());
    };

    return (
        <nav aria-label="Affiliate sections" className="pos-affiliates-tab-strip -mx-1 overflow-x-auto">
            <div
                role="tablist"
                aria-label="Affiliate sections"
                className="pos-affiliates-tab-list flex min-w-max items-end gap-3 px-1 min-[1200px]:min-w-0 min-[1200px]:w-full min-[1200px]:gap-0 min-[1200px]:px-0"
            >
                {tabs.map(({ id, label, icon: Icon }) => {
                    const disabled = id === 'cashout' && !canSeeCashoutQueue;
                    const active = activeTab === id;
                    return (
                        <button
                            key={id}
                            id={`affiliate-tab-${id}`}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-controls={`affiliate-panel-${id}`}
                            tabIndex={active ? 0 : -1}
                            disabled={disabled}
                            onClick={() => onChange(id)}
                            onKeyDown={(event) => handleTabKeyDown(event, id)}
                            className={`pos-affiliates-tab relative inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-[14px] font-bold whitespace-nowrap text-[#0F172A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-[-2px] sm:px-3 min-[1200px]:flex-1 min-[1200px]:justify-center min-[1200px]:px-2 xl:px-3 ${
                                active
                                    ? 'border-[#1A4E8D]'
                                    : 'border-transparent hover:border-slate-300'
                            } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                        >
                            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
