export function SimpleSpecialInstructionsField({
  specialInstructions = '',
  onSpecialInstructionsChange
}) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
      Special instructions (optional)
      <textarea
        value={specialInstructions}
        onChange={(event) => onSpecialInstructionsChange?.(event.target.value)}
        placeholder="Packing notes, landmark hints, or pickup reminders."
        rows={3}
        style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
      />
    </label>
  );
}
