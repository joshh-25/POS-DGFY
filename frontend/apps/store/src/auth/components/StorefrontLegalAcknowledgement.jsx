import React from 'react';
import { resolveSkupervisorUrl } from '../storefrontSkupervisorLink.js';

export default function StorefrontLegalAcknowledgement({
  id,
  checked,
  onChange,
  disabled,
  disabledReason,
  label,
  documents,
  versionLabel
}) {
  const primaryDoc = documents?.[0];

  return (
    <div style={{ borderRadius: 16, border: '1px solid #E2E8F0', background: '#F8FAFC', padding: 16, fontSize: 13, color: '#334155' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label htmlFor={id} style={{ display: 'flex', gap: 10, lineHeight: 1.5, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            required
            style={{ marginTop: 3, width: 18, height: 18, accentColor: '#ea580c', flexShrink: 0 }}
          />
          <span>{label}</span>
        </label>
        {primaryDoc?.href ? (
          <a
            href={resolveSkupervisorUrl(primaryDoc.href)}
            target="_blank"
            rel="noreferrer"
            style={{ alignSelf: 'flex-start', borderRadius: 10, border: '1px solid #ea580c', padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#ea580c', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            See Terms &amp; Conditions
          </a>
        ) : null}
      </div>
      {disabledReason ? (
        <p style={{ marginTop: 10, borderRadius: 8, background: '#FFFBEB', padding: '8px 10px', fontSize: 12, color: '#B45309' }}>{disabledReason}</p>
      ) : null}
      {versionLabel ? (
        <p style={{ marginTop: 10, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>{versionLabel}</p>
      ) : null}
    </div>
  );
}
