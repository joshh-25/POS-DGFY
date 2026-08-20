import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MousePointer2,
  X
} from 'lucide-react';
import { ServiceImage } from '../../ServiceImage.jsx';

export function ServicesDiscoveryDetailModal({
  Badge,
  GhostButton,
  PrimaryButton,
  STYLES,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadow,
  checkoutError,
  closeServiceDetail,
  isBookingSubpage,
  isMobileViewport,
  isServiceDetailsSubpage,
  missingRequiredSelectedServiceIntake,
  money,
  renderStorefrontClosedNotice,
  saveServiceBookingDraft,
  selectedServiceDetail,
  selectedServiceIntakeFields,
  selectedServicePaymentOptions,
  serviceAppointmentAt,
  serviceDraftNotes,
  serviceDraftQuantity,
  serviceIntakeResponses,
  servicePaymentTiming,
  setServiceAppointmentAt,
  setServiceDraftNotes,
  setServiceDraftQuantity,
  setServiceIntakeResponses,
  setServicePaymentTiming,
  storefrontClosedByHours
}) {
  if (!selectedServiceDetail || isBookingSubpage || isServiceDetailsSubpage) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2200, display: 'grid', placeItems: isMobileViewport ? 'end stretch' : 'center', padding: isMobileViewport ? 0 : 24 }}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Close service detail"
        onClick={closeServiceDetail}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') closeServiceDetail();
        }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.58)', backdropFilter: 'blur(8px)' }}
      />
      <section
        style={{
          position: 'relative',
          zIndex: 2201,
          width: isMobileViewport ? '100%' : 'min(980px, calc(100vw - 48px))',
          maxHeight: isMobileViewport ? '92vh' : 'calc(100vh - 48px)',
          overflow: 'hidden',
          borderRadius: isMobileViewport ? '24px 24px 0 0' : 28,
          background: '#ffffff',
          border: '1px solid #dbe5ee',
          boxShadow: '0 30px 90px rgba(15,23,42,.24)',
          display: 'grid',
          gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)'
        }}
      >
        <div style={{ position: 'relative', minHeight: isMobileViewport ? 220 : '100%', background: '#f8fafc' }}>
          <ServiceImage
            item={selectedServiceDetail}
            alt={selectedServiceDetail.variantName || selectedServiceDetail.name}
            loading="eager"
            sizes={isMobileViewport ? '100vw' : '360px'}
            width={360}
            height={isMobileViewport ? 220 : 540}
            fallbackLabel="No service image"
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,.04) 0%, rgba(15,23,42,.26) 100%)' }} />
          <button
            type="button"
            onClick={closeServiceDetail}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,.55)',
              background: 'rgba(15,23,42,.55)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Badge background="rgba(255,255,255,.92)" color={servicesPrimaryDark} border="rgba(255,255,255,.92)">
                {selectedServiceDetail.categoryMeta?.label || 'Service'}
              </Badge>
              <Badge background="rgba(15,23,42,.72)" color="#fff" border="rgba(255,255,255,.14)">
                {selectedServiceDetail.serviceAreaLabel}
              </Badge>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, color: '#fff' }}>
              {selectedServiceDetail.variantName || selectedServiceDetail.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: 'rgba(255,255,255,.92)', fontSize: 13, fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Clock3 size={14} />
                {selectedServiceDetail.durationLabel}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MousePointer2 size={14} />
                {selectedServicePaymentOptions.map((option) => option.label).join(' / ')}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
          <div style={{ padding: isMobileViewport ? '18px 18px 12px' : '24px 28px 16px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.05 }}>
                  {money(selectedServiceDetail.default_sale_price ?? 0)}
                </div>
                <div style={{ fontSize: 14, color: STYLES.colors.text, lineHeight: 1.6, maxWidth: 540 }}>
                  {selectedServiceDetail.description || 'Service details are synced from SKUpervisor. Select your preferred schedule and booking requirements below.'}
                </div>
              </div>
              {!isMobileViewport && (
                <div style={{ minWidth: 180, borderRadius: 18, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 14, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking notes</div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                    SKUpervisor validates lead time, conflicts, and booking rules when you submit.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ overflowY: 'auto', padding: isMobileViewport ? '16px 18px' : '20px 28px', display: 'grid', gap: 18 }}>
            <section style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CalendarDays size={18} color={servicesPrimary} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Preferred Schedule</div>
                  <div style={{ fontSize: 12, color: STYLES.colors.muted }}>Choose the requested appointment time. Final availability is confirmed by SKUpervisor.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr 160px', gap: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                  Preferred date and time
                  <input
                    type="datetime-local"
                    value={serviceAppointmentAt}
                    onChange={(event) => setServiceAppointmentAt(event.target.value)}
                    style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                  />
                </label>
                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                  Payment timing
                  <select
                    value={servicePaymentTiming}
                    onChange={(event) => setServicePaymentTiming(event.target.value)}
                    style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                  >
                    {selectedServicePaymentOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                  Units / count
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={serviceDraftQuantity}
                    onChange={(event) => setServiceDraftQuantity(Math.max(1, Number(event.target.value || 1)))}
                    style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                  />
                </label>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={18} color={servicesPrimary} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Service instructions</div>
                  <div style={{ fontSize: 12, color: STYLES.colors.muted }}>Add any practical notes that will help the service team prepare.</div>
                </div>
              </div>
              <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                Special instructions
                <textarea
                  value={serviceDraftNotes}
                  onChange={(event) => setServiceDraftNotes(event.target.value)}
                  placeholder="Access notes, unit details, pickup preferences, or anything the service team should know."
                  style={{ width: '100%', minHeight: 92, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff', resize: 'vertical' }}
                />
              </label>
            </section>

            {selectedServiceIntakeFields.length > 0 && (
              <section style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={18} color={servicesPrimary} />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Booking requirements</div>
                    <div style={{ fontSize: 12, color: STYLES.colors.muted }}>These fields come from the service intake form configured in SKUpervisor.</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
                  {selectedServiceIntakeFields.map((field) => (
                    <label key={field.id} style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                      {field.label}{field.required ? ' *' : ''}
                      {field.type === 'textarea' ? (
                        <textarea
                          value={serviceIntakeResponses[field.id] || ''}
                          onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                          style={{ width: '100%', minHeight: 92, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff', resize: 'vertical' }}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={serviceIntakeResponses[field.id] || ''}
                          onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                        >
                          <option value="">Select</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : field.type === 'checkbox' ? (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
                          <input
                            type="checkbox"
                            checked={serviceIntakeResponses[field.id] === true}
                            onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.checked }))}
                          />
                          <span style={{ fontSize: 13, color: STYLES.colors.text }}>Confirm</span>
                        </div>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                          value={serviceIntakeResponses[field.id] || ''}
                          onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div style={{ padding: isMobileViewport ? '14px 18px 18px' : '18px 28px 24px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 12 }}>
            {storefrontClosedByHours && renderStorefrontClosedNotice()}
            {checkoutError && (
              <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px' }}>
                {checkoutError}
              </div>
            )}
            {missingRequiredSelectedServiceIntake.length > 0 && (
              <div style={{ fontSize: 13, color: '#b45309', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 14, padding: '10px 12px' }}>
                Complete the required booking details before adding this service to your booking summary.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column-reverse' : 'row', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 13, color: STYLES.colors.muted }}>Current estimate</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: STYLES.colors.dark }}>
                  {money((Number(selectedServiceDetail.default_sale_price ?? 0) || 0) * Math.max(1, Number(serviceDraftQuantity || 1)))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 10 }}>
                <GhostButton style={{ minHeight: 46, minWidth: 150 }} onClick={closeServiceDetail}>
                  Cancel
                </GhostButton>
                <PrimaryButton accentColor={servicesPrimary} accentDarkColor={servicesPrimaryDark} shadowColor={servicesPrimaryShadow} style={{ minHeight: 46, minWidth: 190 }} onClick={() => saveServiceBookingDraft(selectedServiceDetail, 'review')}>
                  Add to Booking
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
