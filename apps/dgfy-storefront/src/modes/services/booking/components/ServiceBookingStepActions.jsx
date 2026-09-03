import React from 'react';

export function ServiceBookingStepActions({
  GhostButton,
  PrimaryButton,
  primaryButtonProps,
  isMobileViewport,
  referenceStyle = false,
  onBack,
  onContinue,
  continueLabel = 'Continue',
}) {
  if (referenceStyle && isMobileViewport) return null;

  const minHeight = referenceStyle ? 51 : (isMobileViewport ? 38 : 44);
  const fontSize = referenceStyle ? 16 : (isMobileViewport ? 14 : 15);
  const borderRadius = referenceStyle ? 12 : undefined;
  const buttonStyle = { minHeight, fontSize, borderRadius };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
      <GhostButton onClick={onBack} style={buttonStyle}>Back</GhostButton>
      <PrimaryButton {...primaryButtonProps} onClick={onContinue} style={buttonStyle}>
        {continueLabel}
      </PrimaryButton>
    </div>
  );
}
