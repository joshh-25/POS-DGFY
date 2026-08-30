/**
 * Phase 219 (#1220): the versioned, customer-facing non-refundable downpayment terms.
 *
 * This module is the SINGLE SOURCE of the exact text a customer sees. The reviewable copy in
 * `docs/legal/downpayment-nonrefundable-terms-v1.md` is generated from the structure below and
 * pinned byte-for-byte by `src/__tests__/downpaymentTermsDocument.test.js` -- edit this file, then
 * re-render the doc; never let the two drift.
 *
 * DRAFT, NOT LEGALLY REVIEWED. #280 (Terms & Conditions lawyer review) is still open. When it
 * lands, replace the sections below and bump DOWNPAYMENT_TERMS_VERSION -- do not edit v1 in place,
 * because #1086 records which version a customer was shown plus a hash of the exact text.
 *
 * Pat's deliberate override of #1220's own instruction (2026-08-31): the draft/pending-review
 * status is recorded ONLY internally -- this header comment, the `docs/legal/` doc's front matter
 * (`status: draft`, `legal_review_status`), and the PR body -- and deliberately NOT as a visible
 * banner over the customer-facing terms text. `DOWNPAYMENT_TERMS_REVIEW_NOTICE` therefore appears
 * only in `renderDownpaymentTermsMarkdown()` (the internal reviewable doc), never in
 * `renderDownpaymentTermsPlainText()` or the modal a customer actually sees.
 */

export const DOWNPAYMENT_TERMS_VERSION = 'downpayment-nonrefundable-v1';
export const DOWNPAYMENT_TERMS_EFFECTIVE_DATE = '2026-08-31';
export const DOWNPAYMENT_TERMS_TITLE = 'Non-refundable downpayment terms';
export const DOWNPAYMENT_TERMS_REVIEW_NOTICE = 'Draft wording, pending formal legal review. These terms describe how this store currently handles non-refundable downpayments. They have not yet been reviewed by a lawyer and may change.';

/**
 * Ordered sections of the document. `heading` is rendered as a subheading, `paragraphs` as body
 * copy in order. Deliberately plain data (no JSX, no markdown syntax inside the strings) so the
 * same content can be rendered as a modal, as a page, in an email, or hashed for #1086.
 */
export const DOWNPAYMENT_TERMS_SECTIONS = Object.freeze([
  {
    heading: 'What you are paying now',
    paragraphs: [
      'A downpayment is a part-payment of your order total, taken now to reserve your order. It is not an extra fee, and it is not a separate charge on top of the order total.',
      'The remaining balance is due when your order is delivered or picked up, as shown at checkout.'
    ]
  },
  {
    heading: 'Why this downpayment is non-refundable',
    paragraphs: [
      'This store has marked its downpayment non-refundable. Once you pay, the store begins reserving stock, scheduling, or preparing your order for you specifically, and that commitment has a cost the store cannot recover.',
      'This applies only where the checkout screen tells you the downpayment is non-refundable, at the moment you pay. It does not apply retroactively: if the store changes this setting later, the terms shown to you when you paid are the terms that govern your order.'
    ]
  },
  {
    heading: 'If you cancel your order',
    paragraphs: [
      'If you cancel after paying the downpayment, the store keeps the downpayment. You are not charged anything further, and the remaining balance is never collected.',
      'Only the downpayment amount is affected. The store never keeps, and never charges, the full order total for a cancelled order.'
    ]
  },
  {
    heading: 'When you still get your money back',
    paragraphs: [
      'If the store rejects or cancels your order for any reason -- including being unable to fulfil it, running out of stock, or closing -- your downpayment is refunded in full. This is true even though the downpayment is marked non-refundable.',
      'If your payment is charged but the order is never actually placed, that payment is refunded in full.'
    ]
  },
  {
    heading: 'How refunds are returned',
    paragraphs: [
      'Refunds are returned to the payment method you used. How long that takes depends on your bank or e-wallet provider, and is outside the store’s control.'
    ]
  },
  {
    heading: 'Questions or disputes',
    paragraphs: [
      'Contact the store directly using the contact details on your order confirmation. If you believe a downpayment was kept in error, raise it with the store first -- most cases are a store-side cancellation, which is always refunded.'
    ]
  },
  {
    heading: 'Version of these terms',
    paragraphs: [
      `These are version ${DOWNPAYMENT_TERMS_VERSION}, effective ${DOWNPAYMENT_TERMS_EFFECTIVE_DATE}. The version shown to you at the time you pay is the version that applies to your order.`
    ]
  }
]);

/**
 * Flat plain-text rendering -- the form #1086 will hash to record what was actually shown, and
 * what the customer-facing modal renders. Deliberately excludes DOWNPAYMENT_TERMS_REVIEW_NOTICE:
 * the draft/pending-review status is recorded internally only (see module header), never as a
 * banner over the customer-facing text.
 */
export const renderDownpaymentTermsPlainText = () => [
  DOWNPAYMENT_TERMS_TITLE,
  ...DOWNPAYMENT_TERMS_SECTIONS.flatMap((section) => [section.heading, ...section.paragraphs])
].join('\n\n');

/**
 * Markdown body of `docs/legal/downpayment-nonrefundable-terms-v1.md`, front matter excluded.
 * This is the internal reviewable copy (Pat / lawyer review), not customer-facing, so it DOES
 * carry DOWNPAYMENT_TERMS_REVIEW_NOTICE -- unlike renderDownpaymentTermsPlainText() above.
 */
export const renderDownpaymentTermsMarkdown = () => [
  `# ${DOWNPAYMENT_TERMS_TITLE}`,
  `> ${DOWNPAYMENT_TERMS_REVIEW_NOTICE}`,
  `Version: \`${DOWNPAYMENT_TERMS_VERSION}\` | Effective: ${DOWNPAYMENT_TERMS_EFFECTIVE_DATE}`,
  ...DOWNPAYMENT_TERMS_SECTIONS.flatMap((section) => [`## ${section.heading}`, ...section.paragraphs])
].join('\n\n');
