import { Check, ChevronDown, ChevronRight, ChevronUp, ChefHat, Clock, FileText, ShoppingBag, Store, X } from 'lucide-react';

function GuestTrackingDrawerCard({
  entry,
  entryPin,
  expanded,
  onToggle,
  onViewOrder,
  selectedStore,
  withAssetOrigin,
  money,
  formatTicketDate,
  getTrackingFlowForOrderMethod
}) {
  const statusLabel = String(entry.status_label || entry.status || 'In progress').trim() || 'In progress';
  const entryMethod = String(entry.order_method || 'delivery').trim().toLowerCase();
  const isPickup = entryMethod === 'pickup';
  const badgeText = isPickup ? 'Pickup' : 'Delivery';
  const trackingSteps = getTrackingFlowForOrderMethod(entryMethod);
  const activeStepIndex = Math.max(0, trackingSteps.findIndex((step) => step.id === entry.status));

  return (
    <div style={{ border: '1px solid #dbe5ee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div
        onClick={onToggle}
        style={{ padding: '12px 14px', display: 'grid', gap: 10, cursor: 'pointer', background: expanded ? '#f8fafc' : '#fff' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {entry.store_logo || selectedStore?.storefront_profile_image_url ? (
              <img src={withAssetOrigin(entry.store_logo || selectedStore?.storefront_profile_image_url)} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>LOGO</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {entry.store_name || selectedStore?.tenant_name || 'Storefront'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>#{entryPin}</div>
          </div>
          <div style={{ color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#f1f5f9', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#1A4E8D', background: '#fff', border: '1px solid #AEE8F4', borderRadius: 999, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1A4E8D' }} />
            {statusLabel}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onViewOrder();
            }}
            style={{ border: 'none', background: 'transparent', color: '#1A4E8D', fontSize: 12, fontWeight: 800, padding: '4px 0', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            View Order <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '14px 14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Total Amount</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{money(entry.total_amount || 0)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              <ShoppingBag size={14} color="#64748b" />
              {entry.item_count || 1} Items
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ color: '#0f172a', fontWeight: 800 }}>{badgeText}</span>
            {entry.branch_name ? <span style={{ margin: '0 6px', color: '#1A4E8D' }}>-</span> : null}
            {entry.branch_name ? <span>{entry.branch_name}</span> : null}
          </div>

          <div style={{ paddingLeft: 8, display: 'grid', gap: 0, marginBottom: 16 }}>
            {trackingSteps.map((step, idx) => {
              const isCompleted = idx < activeStepIndex;
              const isActive = idx === activeStepIndex || (entry.status === 'completed' && idx === trackingSteps.length - 1);
              const isFuture = !isCompleted && !isActive;
              const circleBg = isActive ? '#1A4E8D' : (isCompleted ? '#16a34a' : '#fff');
              const circleBorder = isActive ? '#1A4E8D' : (isCompleted ? '#16a34a' : '#94a3b8');
              const textColor = isFuture ? '#64748b' : '#0f172a';
              let stepTime = null;
              if (idx === 0 && entry.created_at) stepTime = formatTicketDate(entry.created_at);
              else if (isActive && entry.updated_at) stepTime = formatTicketDate(entry.updated_at);

              return (
                <div key={step.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, position: 'relative', paddingBottom: idx === trackingSteps.length - 1 ? 0 : 14 }}>
                  {idx !== trackingSteps.length - 1 ? (
                    <div style={{ position: 'absolute', left: 11, top: 24, bottom: -4, width: 2, background: isCompleted ? '#16a34a' : '#e2e8f0', zIndex: 0 }} />
                  ) : null}
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: circleBg, border: `2px solid ${circleBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, color: isActive ? '#fff' : (isCompleted ? '#fff' : '#64748b') }}>
                    {isPickup ? (
                      isCompleted ? <Check size={12} strokeWidth={4} /> :
                        idx === 0 ? <FileText size={10} strokeWidth={2.5} /> :
                          idx === 1 ? <Store size={10} strokeWidth={2.5} /> :
                            idx === 2 ? <ChefHat size={10} strokeWidth={2.5} /> :
                              <ShoppingBag size={10} strokeWidth={2.5} />
                    ) : (
                      isCompleted ? <Check size={12} strokeWidth={4} /> : (isActive ? <span style={{ fontSize: 10, fontWeight: 900 }}>.</span> : <ShoppingBag size={10} />)
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: 2, transform: 'translateY(-2px)' }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 800 : 600, color: isActive ? '#1A4E8D' : textColor }}>{step.label}</div>
                    {stepTime ? <div style={{ fontSize: 11, color: '#64748b' }}>{stepTime}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Estimated Ready Time</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{entry.created_at ? new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              {entry.eta_minutes ? `${entry.eta_minutes} mins` : 'Pending'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', marginTop: 14 }}>
            <Clock size={12} /> Last updated: {entry.updated_at ? formatTicketDate(entry.updated_at) : 'just now'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GuestTrackingDrawer({
  isOpen,
  isMobileViewport,
  trackingPinInput,
  onTrackingPinInputChange,
  onTrack,
  selectedStore,
  guestTrackedOrders,
  expandedGuestDrawerPin,
  onExpandedGuestDrawerPinChange,
  onClose,
  openFullTrackingForPin,
  withAssetOrigin,
  money,
  formatTicketDate,
  getTrackingFlowForOrderMethod,
  isAccountTracking = false
}) {
  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close tracking drawer"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 2498, border: 'none', background: 'rgba(15,23,42,0.28)', cursor: 'pointer' }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: 2499,
          width: isMobileViewport ? 'min(94vw, 430px)' : 430,
          maxWidth: '100vw',
          height: '100vh',
          background: '#fff',
          borderLeft: '1px solid #dbe5ee',
          boxShadow: '-16px 0 36px rgba(15,23,42,0.18)',
          padding: isMobileViewport ? '14px 14px 16px' : '16px 14px 18px',
          display: 'grid',
          gridTemplateRows: 'auto auto 1fr',
          gap: 12,
          overflow: 'hidden',
          overscrollBehavior: 'contain'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>In Progress Orders</div>
            <div style={{ marginTop: 2, fontSize: 12, color: '#64748b' }}>
              {isAccountTracking ? 'Active orders linked to your DGFY account.' : 'Active guest orders saved on this device.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tracking drawer"
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: 0, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center', position: 'sticky', top: 0, zIndex: 2, background: '#fff', paddingBottom: 6, borderBottom: '1px solid #eef2f6' }}>
          <input
            value={trackingPinInput}
            onChange={(e) => onTrackingPinInputChange(e.target.value.toUpperCase())}
            placeholder="SK-018DS8"
            style={{ minWidth: 0, border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', fontSize: 13 }}
          />
          <button
            type="button"
            onClick={onTrack}
            disabled={!selectedStore}
            style={{ minHeight: 40, borderRadius: 12, border: '1px solid #334155', background: '#334155', color: '#fff', padding: '0 14px', fontWeight: 700, cursor: selectedStore ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
          >
            Track
          </button>
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'grid', gap: 8, alignContent: 'start', paddingRight: 2 }}>
          {guestTrackedOrders.length === 0 ? (
            <div style={{ fontSize: 13, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', background: '#f8fafc' }}>
              {isAccountTracking
                ? 'No in-progress account orders yet. Enter a tracking PIN to load a specific order.'
                : 'No in-progress orders saved yet. Enter a tracking PIN from this storefront to load one.'}
            </div>
          ) : null}
          {guestTrackedOrders.map((entry) => {
            const entryPin = String(entry.tracking_pin || '').trim().toUpperCase();
            return (
              <GuestTrackingDrawerCard
                key={`guest-track-drawer-${entryPin}`}
                entry={entry}
                entryPin={entryPin}
                expanded={expandedGuestDrawerPin === entryPin}
                onToggle={() => onExpandedGuestDrawerPinChange(expandedGuestDrawerPin === entryPin ? null : entryPin)}
                onViewOrder={() => openFullTrackingForPin(entryPin)}
                selectedStore={selectedStore}
                withAssetOrigin={withAssetOrigin}
                money={money}
                formatTicketDate={formatTicketDate}
                getTrackingFlowForOrderMethod={getTrackingFlowForOrderMethod}
              />
            );
          })}
        </div>
      </aside>
    </>
  );
}
