import { PosReportsKpiCard } from '../components/PosReportsKpiCards.jsx';

const REPORT_ACCENTS_BY_AFFILIATE_TONE = {
    blue: 'blue',
    amber: 'red',
    cyan: 'blue',
    green: 'green'
};

export default function AffiliateStatCard({ icon: Icon, label, value, tone = 'cyan', className = '' }) {
    return (
        <PosReportsKpiCard
            label={label}
            value={value}
            Icon={Icon}
            accent={REPORT_ACCENTS_BY_AFFILIATE_TONE[tone] || 'blue'}
            valueClassName="affiliate-kpi-value"
            className={className}
        />
    );
}
