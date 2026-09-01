import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DOWNPAYMENT_TERMS_EFFECTIVE_DATE,
  DOWNPAYMENT_TERMS_SECTIONS,
  DOWNPAYMENT_TERMS_TITLE,
  DOWNPAYMENT_TERMS_VERSION,
  renderDownpaymentTermsMarkdown,
  renderDownpaymentTermsPlainText
} from '../shared/model/downpaymentTermsDocument.js';

const DOC_PATH = path.resolve(process.cwd(), '../../docs/legal/downpayment-nonrefundable-terms-v1.md');

// Phase 219 (#1220): the terms are versioned from day one because #1086's acceptance capture
// records which version was shown plus a hash of the exact text -- unversioned copy would make
// that unimplementable without a rewrite.
describe('downpaymentTermsDocument', () => {
  it('pins the v1 version identifier and effective date', () => {
    expect(DOWNPAYMENT_TERMS_VERSION).toBe('downpayment-nonrefundable-v1');
    expect(DOWNPAYMENT_TERMS_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('states the store-cancellation refund carve-out and never promises a full-total refund', () => {
    const text = renderDownpaymentTermsPlainText();
    expect(text).toContain('rejects or cancels your order');
    expect(text).toContain('refunded in full');
    expect(text).toContain('never keeps, and never charges, the full order total');
  });

  it('marks itself as pending formal legal review in the internal reviewable doc only, never in the customer-facing plain text', () => {
    // Pat's deliberate override of #1220's own instruction (2026-08-31): the draft/pending-review
    // status is recorded internally only (this markdown doc, code comments, PR body) -- never as
    // a banner over the customer-facing text renderDownpaymentTermsPlainText() produces.
    expect(renderDownpaymentTermsMarkdown()).toContain('pending formal legal review');
    expect(renderDownpaymentTermsPlainText()).not.toContain('pending formal legal review');
  });

  it('renders every section with a heading and at least one paragraph', () => {
    expect(DOWNPAYMENT_TERMS_SECTIONS.length).toBeGreaterThan(0);
    DOWNPAYMENT_TERMS_SECTIONS.forEach((section) => {
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.paragraphs.length).toBeGreaterThan(0);
    });
    expect(renderDownpaymentTermsPlainText().startsWith(DOWNPAYMENT_TERMS_TITLE)).toBe(true);
  });

  // The in-repo reviewable copy is generated from this module. If this fails, the doc was edited
  // by hand: port the change into DOWNPAYMENT_TERMS_SECTIONS and regenerate the doc body with
  // renderDownpaymentTermsMarkdown() rather than letting the two drift.
  it('matches the committed docs/legal draft byte-for-byte', () => {
    const raw = fs.readFileSync(DOC_PATH, 'utf8');
    const body = raw.replace(/^---\n[\s\S]*?\n---\n\n<!--\n[\s\S]*?\n-->\n\n/, '');
    expect(body.trimEnd()).toBe(renderDownpaymentTermsMarkdown());
  });
});
