export const POS_REPORT_VALUE_TONE_CLASSES = Object.freeze({
  primary: 'text-[#0F172A]',
  secondary: 'text-[#475569]',
  muted: 'text-[#64748B]',
  brand: 'text-[#15579B]',
  positive: 'text-[#059669]',
  danger: 'text-[#DC2626]'
});

export const getPosReportValueToneClass = (tone = 'secondary') => (
  POS_REPORT_VALUE_TONE_CLASSES[tone] || POS_REPORT_VALUE_TONE_CLASSES.secondary
);

export const getPosReportSignedValueTone = (value, nonNegativeTone = 'secondary') => (
  Number(value) < 0 ? 'danger' : nonNegativeTone
);

export const getPosReportColumnValueToneClass = (column, row) => {
  const tone = typeof column?.valueTone === 'function'
    ? column.valueTone(row)
    : column?.valueTone;

  return getPosReportValueToneClass(tone);
};
