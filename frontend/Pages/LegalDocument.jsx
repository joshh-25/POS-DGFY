import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Building2, ShieldCheck, Store, UserRound } from 'lucide-react';

const providerClause = 'DGFY is an e-marketplace/platform service provider. The seller owns the product, sets the price, fulfills the order, and remains the seller of record. DGFY facilitates the sale, collects payment through a licensed payment partner, deducts disclosed fees, and remits the seller\'s net settlement.';

const legalDocuments = {
    '/legal/dgfy-company-terms': {
        title: 'DGFY Company Registration Terms',
        version: 'dgfy-company-terms-2026-05-26',
        icon: Building2,
        summary: 'These terms govern company registration, founder ownership, seller-of-record obligations, and the required business registration acknowledgement.',
        sections: [
            {
                heading: 'Company owner of record',
                body: 'The registered company remains responsible for the products, services, prices, fulfillment, customer support, tax obligations, and payout account ownership entered or operated through DGFY and SKUpervisor.'
            },
            {
                heading: 'Founder account source',
                body: 'Company registration uses the signed-in DGFY account as the founder identity. Founder email, phone, username seed, and password credentials are derived server-side from that account and cannot be overridden from the company registration form.'
            },
            {
                heading: 'Compliance start state',
                body: 'New companies start in non-compliant active mode. Compliance activation, fiscal setup, provider onboarding, payout routing, and settlement evidence remain separate SKUpervisor settings and operational workflows.'
            },
            {
                heading: 'Marketplace provider acknowledgement',
                body: providerClause
            }
        ]
    },
    '/legal/dgfy-marketplace-provider-terms': {
        title: 'DGFY Marketplace Provider Terms',
        version: 'dgfy-marketplace-provider-2026-05-26',
        icon: Store,
        summary: 'These terms describe DGFY as a marketplace/platform service provider and preserve the seller-of-record boundary.',
        sections: [
            {
                heading: 'Platform role',
                body: providerClause
            },
            {
                heading: 'Seller responsibilities',
                body: 'The seller owns catalog accuracy, product or service availability, pricing, fulfillment, refunds where applicable, customer support, tax obligations, and operational compliance for its business.'
            },
            {
                heading: 'Payment handling',
                body: 'Payments are processed through licensed payment partners. DGFY may collect payment on behalf of the seller, deduct disclosed platform or processing fees, and remit the seller\'s net settlement according to provider availability and applicable rules.'
            },
            {
                heading: 'No stored-value promise',
                body: 'DGFY marketplace terms do not create wallet balance, points conversion, cash-out credit, or a DGFY resale relationship for merchant goods.'
            }
        ]
    },
    '/legal/dgfy-account-terms': {
        title: 'DGFY Account Terms',
        version: 'dgfy-account-terms-2026-05-26',
        icon: UserRound,
        summary: 'These terms govern the DGFY account used for customer activity, order tracking, company registration, and company invitations.',
        sections: [
            {
                heading: 'Account use',
                body: 'A DGFY account may be used for customer orders, bookings, profile activity, tracking references, saved account details, company ownership workflows, and company invitations.'
            },
            {
                heading: 'Credential responsibility',
                body: 'The account holder is responsible for keeping account credentials secure and for signing out on shared devices. Suspended or deleted accounts cannot continue authenticated DGFY workflows.'
            },
            {
                heading: 'Company registration',
                body: 'When a signed-in DGFY account registers a company, SKUpervisor derives founder identity and contact details from that DGFY account. The company form collects only company name, Business Industry, and current legal acknowledgement.'
            },
            {
                heading: 'Marketplace provider acknowledgement',
                body: providerClause
            }
        ]
    },
    '/privacy': {
        title: 'DGFY Privacy Policy',
        version: 'dgfy-privacy-2026-05-26',
        icon: ShieldCheck,
        summary: 'This policy summarizes how DGFY account, registration, order, verification, and support information is handled.',
        sections: [
            {
                heading: 'Information used by DGFY',
                body: 'DGFY may process account profile details, login and session metadata, order and booking references, company registration details, invitation records, legal acknowledgement snapshots, and support or audit metadata needed to operate the service.'
            },
            {
                heading: 'Registration evidence',
                body: 'DGFY records explicit legal acknowledgements with version, timestamp, request metadata, and immutable text or hash snapshots so account and company registration decisions can be audited.'
            },
            {
                heading: 'Operational sharing',
                body: 'Information may be shared across DGFY and SKUpervisor surfaces when needed to provide account access, company registration, tenant membership, order tracking, customer support, payment-provider operations, compliance workflows, and security controls.'
            },
            {
                heading: 'Security and retention',
                body: 'DGFY keeps security, legal, tenant, customer, transaction, and audit evidence for operational and compliance purposes. Account deletion uses deidentification where evidence must be preserved.'
            }
        ]
    }
};

export default function LegalDocument() {
    const location = useLocation();
    const document = legalDocuments[location.pathname] || legalDocuments['/legal/dgfy-company-terms'];
    const Icon = document.icon;

    return (
        <main className="min-h-screen bg-[#f4faf8] px-4 py-8 text-[#132033]">
            <div className="mx-auto w-full max-w-4xl">
                <Link to="/register-company" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f5f9f] hover:text-[#174f86]">
                    <ArrowLeft className="h-4 w-4" />
                    Back to registration
                </Link>

                <header className="mt-6 border-b border-[#d8e8e3] pb-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f4ff] text-[#1f5f9f]">
                        <Icon className="h-7 w-7" />
                    </div>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Current DGFY terms</p>
                    <h1 className="mt-2 text-3xl font-black tracking-normal md:text-4xl">{document.title}</h1>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{document.version}</p>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">{document.summary}</p>
                </header>

                <div className="py-6">
                    {document.sections.map((section) => (
                        <section key={section.heading} className="border-b border-[#d8e8e3] py-5 last:border-b-0">
                            <h2 className="text-lg font-bold">{section.heading}</h2>
                            <p className="mt-2 text-sm leading-7 text-slate-700">{section.body}</p>
                        </section>
                    ))}
                </div>
            </div>
        </main>
    );
}
