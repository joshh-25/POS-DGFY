import { Banknote, Ban, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { statusLabel, statusTextClass } from './affiliatePresentation.js';

const renderStatusIcon = (status, compact) => {
    const className = `${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0`;

    switch (String(status || '').toLowerCase()) {
        case 'active':
        case 'approved':
            return <CheckCircle2 aria-hidden="true" className={className} />;
        case 'paid':
            return <Banknote aria-hidden="true" className={className} />;
        case 'pending':
        case 'requested':
            return <Clock aria-hidden="true" className={className} />;
        case 'suspended':
            return <Ban aria-hidden="true" className={className} />;
        case 'revoked':
        case 'rejected':
        case 'cancelled':
            return <XCircle aria-hidden="true" className={className} />;
        default:
            return <Circle aria-hidden="true" className={className} />;
    }
};

export default function AffiliateStatusBadge({ status, compact = false }) {
    return (
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-[13px]'} font-semibold ${statusTextClass(status)}`}>
            {renderStatusIcon(status, compact)}
            {statusLabel(status)}
        </span>
    );
}
