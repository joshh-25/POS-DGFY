export function SimpleCheckoutScheduleFields({
  isMobileViewport = false,
  scheduledFor = '',
  specialInstructions = '',
  onScheduledForChange,
  onSpecialInstructionsChange
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
        Schedule time (optional)
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(event) => onScheduledForChange?.(event.target.value)}
          style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
        />
      </label>
      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
        Special instructions (optional)
        <textarea
          value={specialInstructions}
          onChange={(event) => onSpecialInstructionsChange?.(event.target.value)}
          placeholder="Packing notes, landmark hints, or pickup reminders."
          rows={3}
          style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical' }}
        />
      </label>
    </div>
  );
}
