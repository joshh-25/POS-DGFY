import React, { useMemo } from 'react';
import { AlertTriangle, CalendarDays, Clock3, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import {
    BackOfficeDataTable as DataTable,
    BackOfficeEmptyState as Empty,
    BackOfficeMetric as Metric,
    BackOfficeSectionCard as SectionCard
} from '../../../../../packages/web-core/src/components/backOffice/BackOfficePrimitives.jsx';

const money = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
}).format(Number(value) || 0);

const number = (value) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value) || 0);

const formatRangeLabel = (meta) => {
    const from = meta?.date_from || '';
    const to = meta?.date_to || '';
    if (from && to && from !== to) return `${from} – ${to}`;
    return from || to || 'selected range';
};

/**
 * OPIS-owned POS activity analytics workspace (#2193). Presentational only:
 * BusinessAdminPage owns the date/branch filters and the
 * businessAdminApi.posActivityAnalytics() fetch; this module renders daily
 * trends, customer counts, and historical quiet-period guidance from the
 * server-aggregated operational ledger. No PostHog or client events feed these
 * metrics, and nothing here infers live deployment safety.
 */
export default function PosActivityAnalyticsPage({ data }) {
    const meta = data?.meta || {};
    const totals = data?.totals || {};
    const customers = data?.customers || {};
    const daily = useMemo(() => (Array.isArray(data?.daily) ? data.daily : []), [data]);
    const quietPeriods = useMemo(
        () => (Array.isArray(data?.quiet_periods) ? data.quiet_periods : []),
        [data]
    );
    const definitions = data?.definitions || {};
    const guidance = data?.guidance || {};
    const posthogRole = data?.posthog_role || {};

    const maxDailySales = useMemo(
        () => daily.reduce((max, row) => Math.max(max, Number(row?.sale_count) || 0), 0),
        [daily]
    );
    const hasActivity = (Number(totals.qualifying_sales) || 0) > 0;

    const dailyRows = useMemo(() => daily.map((row) => ({
        ...row,
        key: row.business_date,
        sales_label: number(row.sale_count),
        payments_label: money(row.payment_total)
    })), [daily]);

    if (!data) {
        return <Empty message="POS activity analytics are unavailable for these filters." />;
    }

    return (
        <div className="business-admin-pos-activity" data-testid="pos-activity-analytics">
            <div className="business-admin-alert info" role="note">
                <ShieldCheck size={17} />
                <div>
                    <strong>Operational ledger, historical guidance only.</strong>
                    <div>
                        {formatRangeLabel(meta)} · {meta.timezone || 'Asia/Manila'} ·{' '}
                        {meta.branch_id ? `Branch #${meta.branch_id}` : 'Authorized branches'} ·{' '}
                        Server-side tenant-scoped POS records. Historical quiet periods below are planning
                        guidance — they do not mean deployment is currently safe.
                    </div>
                </div>
            </div>

            <div className="business-admin-metric-grid" aria-label="POS activity summary">
                <Metric
                    label="Completed paid sales"
                    value={number(totals.qualifying_sales)}
                    hint="One sale per transaction; split tender never multiplies the count"
                />
                <Metric
                    label="Payment volume"
                    value={money(totals.payment_total)}
                    hint="Persisted transaction totals, summed once per sale"
                />
                <Metric
                    label="Distinct linked customers"
                    value={number(customers.distinct_linked_customers)}
                    hint="Distinct store_customer_id links only — no snapshot merging"
                />
                <Metric
                    label="Walk-in transactions"
                    value={number(customers.unlinked_transaction_count)}
                    hint="Qualifying sales without a linked customer profile"
                />
            </div>

            <SectionCard
                title="Daily activity trend"
                subtitle={`${formatRangeLabel(meta)} · completed, paid POS sales per Manila business date`}
            >
                {dailyRows.length && hasActivity ? (
                    <>
                        <div className="business-admin-pos-activity-bars" aria-label="Daily completed paid sales">
                            {dailyRows.map((row) => (
                                <div key={row.key} className="business-admin-pos-activity-bar-row">
                                    <span className="business-admin-pos-activity-bar-label">
                                        {row.business_date} · {row.weekday_label}
                                    </span>
                                    <span className="business-admin-pos-activity-bar-track" aria-hidden="true">
                                        <span
                                            className="business-admin-pos-activity-bar-fill"
                                            style={{ width: `${maxDailySales ? (Number(row.sale_count) / maxDailySales) * 100 : 0}%` }}
                                        />
                                    </span>
                                    <span className="business-admin-pos-activity-bar-value">
                                        {row.sales_label} sales · {row.payments_label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <DataTable
                            columns={[
                                { key: 'business_date', label: 'Business date' },
                                { key: 'weekday_label', label: 'Weekday' },
                                { key: 'sales_label', label: 'Completed paid sales' },
                                { key: 'payments_label', label: 'Payment volume' }
                            ]}
                            rows={dailyRows}
                            rowKey={(row) => row.key}
                            emptyMessage="No daily activity in this range."
                        />
                    </>
                ) : (
                    <Empty message="No completed, paid POS sales were recorded for these filters." />
                )}
            </SectionCard>

            <SectionCard
                title="Customer summary"
                subtitle="Distinct identified customers versus walk-in transactions"
            >
                <div className="business-admin-pos-activity-definitions">
                    <p>
                        <UserRound size={14} aria-hidden="true" />{' '}
                        <strong>{number(customers.distinct_linked_customers)}</strong> distinct linked
                        customers and <strong>{number(customers.unlinked_transaction_count)}</strong>{' '}
                        walk-in transactions in {formatRangeLabel(meta)}.
                    </p>
                    {definitions.distinct_linked_customers ? (
                        <p className="business-admin-pos-activity-definition">{definitions.distinct_linked_customers}</p>
                    ) : null}
                </div>
            </SectionCard>

            <SectionCard
                title="Historically quiet periods"
                subtitle="Recurring weekday/hour slots ranked by average completed paid sales per occurrence"
            >
                <div className="business-admin-alert warning" role="note">
                    <AlertTriangle size={17} />
                    <div>
                        <strong>Planning guidance — not a live safety signal.</strong>
                        <div>
                            {guidance.historical_only || 'These patterns describe history, not current terminal, checkout, or synchronization state.'}{' '}
                            {guidance.operating_hours_unknown || ''}
                        </div>
                    </div>
                </div>
                {quietPeriods.length && hasActivity ? (
                    <DataTable
                        columns={[
                            { key: 'rank', label: '#' },
                            { key: 'weekday_label', label: 'Weekday' },
                            { key: 'hour_label', label: 'Hour (Manila)' },
                            { key: 'avg_label', label: 'Avg sales / occurrence' },
                            { key: 'sales_label', label: 'Sales in range' },
                            { key: 'payments_label', label: 'Payment context' }
                        ]}
                        rows={quietPeriods.map((slot) => ({
                            ...slot,
                            key: `${slot.weekday}:${slot.hour}`,
                            avg_label: number(slot.avg_sales_per_occurrence),
                            sales_label: number(slot.sale_count),
                            payments_label: money(slot.payment_total)
                        }))}
                        rowKey={(row) => row.key}
                        emptyMessage="No quiet-period guidance for this range."
                    />
                ) : (
                    <Empty message="No quiet-period guidance for this range. Widen the date range or clear the branch filter." />
                )}
                <p className="business-admin-pos-activity-footnote">
                    <Clock3 size={14} aria-hidden="true" /> Zero-activity slots are included in the
                    ranking and may mean a branch was closed — branch operating schedules are unknown
                    to this view. <CalendarDays size={14} aria-hidden="true" /> Payment and customer
                    columns are context only; ranking uses the sale-count average. <Wallet size={14} aria-hidden="true" />{' '}
                    {posthogRole.exploratory_use || ''}
                </p>
            </SectionCard>

            <SectionCard title="Metric definitions" subtitle="What these numbers mean and what they exclude">
                <ul className="business-admin-pos-activity-definitions">
                    {definitions.qualifying_sale ? <li>{definitions.qualifying_sale}</li> : null}
                    {definitions.excluded ? <li>{definitions.excluded}</li> : null}
                    {definitions.quiet_periods ? <li>{definitions.quiet_periods}</li> : null}
                    {guidance.live_safety_excluded ? <li>{guidance.live_safety_excluded}</li> : null}
                    {posthogRole.operational_source ? <li>{posthogRole.operational_source}</li> : null}
                </ul>
            </SectionCard>
        </div>
    );
}
