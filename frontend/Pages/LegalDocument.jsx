import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Building2, ShieldCheck, Store, UserRound, ChevronRight } from 'lucide-react';
import NotFoundPage from '../src/components/common/NotFoundPage.jsx';

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
    const document = legalDocuments[location.pathname];
    const returnTo = String(location.state?.returnTo || '/register-company').trim() || '/register-company';

    const [activeSection, setActiveSection] = useState('');

    useEffect(() => {
        if (!document) return undefined;
        const handleScroll = () => {
            const sections = document.sections.map(s => s.heading.toLowerCase().replace(/\s+/g, '-'));
            let current = '';
            for (const id of sections) {
                const el = window.document.getElementById(id);
                if (el && el.getBoundingClientRect().top < 150) {
                    current = id;
                }
            }
            if (current !== activeSection) {
                setActiveSection(current);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [document?.sections, activeSection]);

    if (!document) {
        return (
            <NotFoundPage
                title="Legal document not found"
                description="This legal document link is invalid or no longer available. No substitute document has been loaded."
                homeTo={returnTo}
                homeLabel="Back to registration"
            />
        );
    }

    const Icon = document.icon;

    const scrollToSection = (e, id) => {
        e.preventDefault();
        const el = window.document.getElementById(id);
        if (el) {
            window.scrollTo({
                top: el.offsetTop - 80,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans text-[#0F172A] flex flex-col">
            {/* HERO SECTION */}
            <section className="bg-[#1A4E8D] text-white px-6 py-16 lg:py-24 relative overflow-hidden shrink-0">
                {/* Background Pattern/Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#1A4E8D] to-[#0F172A] opacity-90"></div>
                <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-white/5 blur-[100px]"></div>
                
                <div className="container mx-auto max-w-6xl relative z-10">
                    <Link to={returnTo} state={location.state || null} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-200 hover:text-white transition-colors mb-8">
                        <ArrowLeft className="h-4 w-4" />
                        Back to registration
                    </Link>

                    <div className="flex flex-col md:flex-row md:items-end gap-8 justify-between">
                        <div className="max-w-3xl">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-sm border border-white/10 shadow-sm">
                                    <Icon className="h-6 w-6" />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-widest text-blue-200">Official Legal Document</span>
                            </div>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-5 leading-tight">{document.title}</h1>
                            <p className="text-lg text-blue-100 max-w-2xl leading-relaxed">{document.summary}</p>
                        </div>
                        <div className="flex-shrink-0 text-left md:text-right">
                            <p className="text-xs font-semibold uppercase tracking-widest text-blue-300 mb-2">Document Version</p>
                            <p className="text-sm font-mono bg-black/20 px-4 py-2 rounded-xl inline-block border border-white/10 shadow-inner">{document.version}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CONTENT LAYOUT */}
            <section className="container mx-auto max-w-6xl px-6 py-12 lg:py-20 flex-1">
                <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 relative items-start">
                    
                    {/* LEFT: MAIN DOCUMENT */}
                    <main className="flex-1 min-w-0 bg-white p-8 lg:p-14 rounded-3xl shadow-sm border border-slate-200">
                        <div className="max-w-none">
                            
                            <p className="text-lg text-slate-700 font-medium mb-10 pb-10 border-b border-slate-100">
                                This document outlines the official terms and policies for DGFY. By proceeding with registration or use of our services, you acknowledge and agree to these terms.
                            </p>

                            <div className="space-y-16">
                                {document.sections.map((section, index) => {
                                    const sectionId = section.heading.toLowerCase().replace(/\s+/g, '-');
                                    return (
                                        <div key={section.heading} id={sectionId} className="scroll-mt-24">
                                            <div className="flex items-center gap-5 mb-6">
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-base font-bold text-[#1A4E8D] shadow-inner">
                                                    {index + 1}
                                                </span>
                                                <h2 className="text-2xl font-bold tracking-tight m-0 text-slate-900">{section.heading}</h2>
                                            </div>
                                            <div className="pl-[60px]">
                                                <p className="text-base leading-8 text-slate-600 m-0">{section.body}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </main>

                    {/* RIGHT: TABLE OF CONTENTS (STICKY SIDEBAR) */}
                    <aside className="lg:w-80 flex-shrink-0 sticky top-12">
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">Contents</h3>
                            <ul className="space-y-4">
                                {document.sections.map((section, index) => {
                                    const sectionId = section.heading.toLowerCase().replace(/\s+/g, '-');
                                    const isActive = activeSection === sectionId || (!activeSection && index === 0);
                                    return (
                                        <li key={sectionId}>
                                            <a 
                                                href={`#${sectionId}`}
                                                onClick={(e) => scrollToSection(e, sectionId)}
                                                className={`flex text-sm font-medium transition-colors duration-200 group ${
                                                    isActive 
                                                    ? 'text-[#1A4E8D]' 
                                                    : 'text-slate-500 hover:text-slate-900'
                                                }`}
                                            >
                                                <span className={`mr-3 transition-colors ${isActive ? 'text-[#1A4E8D]' : 'text-slate-300 group-hover:text-slate-400'}`}>
                                                    {index + 1}.
                                                </span>
                                                <span className="leading-snug">{section.heading}</span>
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                            
                            <div className="mt-8 pt-8 border-t border-slate-100">
                                <Link 
                                    to={returnTo}
                                    state={location.state || null}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F8FAFC] px-5 py-3.5 text-sm font-semibold text-slate-700 hover:bg-[#E2E8F0] hover:text-slate-900 transition-colors border border-slate-200 shadow-sm"
                                >
                                    Return to Registration
                                </Link>
                            </div>
                        </div>
                    </aside>

                </div>
            </section>
        </div>
    );
}
