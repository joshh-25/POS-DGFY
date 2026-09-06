import { VAT_DISCLOSURE_NOTE } from '../../model/storefrontFeesAndTaxesPresentation.js';

/**
 * #1615: single source of the "VAT is inclusive, computed pre-discount" wording/style, shown once
 * under the totals block on every checkout summary surface (desktop + mobile, all three modes) so
 * the disclosure stays visually consistent and doesn't drift per render site.
 */
export function VatDisclosureNote() {
  return (
    <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>{VAT_DISCLOSURE_NOTE}</div>
  );
}
