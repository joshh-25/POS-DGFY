import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAuditDate, formatAuditDateParts, formatAuditDetailLines, formatAuditEventLabel, formatAuditEventLabels, getAuditAdditionalLines, getAuditPayloadFileName, getAuditReadableDetailFields, getAuditReadableDetailGridClassName, getAuditReadableFields, groupAuditDetailLines } from '../components/AuditWorkspacePanel.jsx';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

describe('POS audit workspace contract', () => {
    it('keeps the navigation and workspace admin-gated', () => {
        const sidebar = read('src/features/pos/components/TerminalWorkspaceSidebar.jsx');
        const page = read('src/features/pos/pages/TerminalPage.jsx');
        const layout = read('src/features/pos/components/TerminalPageLayout.jsx');

        expect(sidebar).toContain('pos-nav-audit');
        expect(sidebar).toContain('{canViewAudit && (');
        expect(page).toContain("const canViewAudit = isMasterAdminOperator || normalizedTerminalRole === 'admin'");
        expect(layout).toContain('<AuditWorkspacePanel');
        expect(layout).toContain("const isAuditWorkspace = isOperationsWorkspaceMode && posViewMode === 'audit';");
        expect(layout).toContain('|| isAuditWorkspace;');
    });

    it('uses the tenant audit endpoint and includes the requested POS events', () => {
        const service = read('src/features/pos/services/auditService.js');
        const panel = read('src/features/pos/components/AuditWorkspacePanel.jsx');
        const filterDialog = read('src/features/pos/components/AuditDateFilterDialog.jsx');
        const results = read('src/features/pos/components/AuditWorkspaceResults.jsx');
        const workspaceHook = read('src/features/pos/components/useAuditWorkspace.js');
        const auditSources = [panel, filterDialog, results, workspaceHook].join('\n');

        expect(service).toContain("api.get('/audit'");
        expect(auditSources).toContain('POS hardware checked');
        expect(auditSources).toContain('formatAuditEventLabel');
        expect(auditSources).toContain('Search all transaction fields...');
        expect(auditSources).toContain('pos-audit-calendar-button');
        expect(auditSources).toContain('w-10 shrink-0 items-center justify-center');
        expect(auditSources).toContain('sr-only min-[768px]:not-sr-only');
        expect(auditSources).toContain('aria-label="Refresh audit history"');
        expect(auditSources).toContain('contentSized');
        expect(auditSources).toContain('pos-audit-calendar-surface');
        expect(auditSources).toContain('border-rose-300 bg-rose-50/40');
        expect(auditSources).toContain('bg-[#1A4E8D]');
        expect(auditSources).toContain('date_from: appliedFilters.dateFrom');
        expect(auditSources).toContain('date_to: appliedFilters.dateTo');
        expect(auditSources).toContain('pos-audit-apply-dates');
        expect(auditSources).toContain('showClearAll={false}');
        expect(auditSources).toContain('fillAvailable');
        expect(auditSources).toContain('className="flex-nowrap py-0"');
        expect(auditSources).toContain('Technical payload');
        expect(auditSources).toContain('getAuditPayloadFileName');
        expect(auditSources).toContain('inline-flex min-h-8 min-w-0 flex-1 items-center gap-1 truncate');
        expect(auditSources).toContain('basis-full flex-1 items-center justify-end gap-2 min-[768px]:basis-auto');
        expect(auditSources).toContain('inline-flex h-8 w-8 shrink-0 items-center justify-center');
        expect(auditSources).toContain('max-h-48 overflow-auto');
        expect(auditSources).toContain('getAuditReadableDetailFields');
        expect(auditSources).toContain('flex min-w-0 flex-col items-end gap-0.5 text-right');
        expect(auditSources).toContain("align: 'right'");
        expect(auditSources).toContain('context.join(\' · \')');
        expect(auditSources).toContain('className="pos-audit-entry-details w-full"');
        expect(auditSources).toContain('pos-audit-results-surface overflow-hidden');
        expect(auditSources).toContain('pos-audit-mobile-records grid gap-2 p-2');
        expect(auditSources).toContain('<PosTableActionButton');
        expect(auditSources).toContain('className="border-t border-blue-50 bg-slate-50/70"');
        expect(auditSources).toContain('<td colSpan={4} className="px-4 py-3">');
        expect(auditSources).toContain('data-testid="pos-audit-scroll-region"');
        expect(auditSources).toContain('auditScrollRegionRef');
        expect(auditSources).toContain('scrollSelectedRowToTop');
        expect(auditSources).toContain('scrollRegion.scrollTo');
        expect(auditSources).toContain('POS_PAGINATION_FOOTER_CLASS');
        expect(auditSources).toContain('className={POS_PAGINATION_FOOTER_CLASS}');
        expect(auditSources).toContain('lg:grid-cols-4');
        expect(auditSources).toContain('min-w-0 break-words');
        expect(auditSources).not.toContain('min-w-0 break-all');
        expect(auditSources).toContain('pos-audit-data-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]');
        expect(auditSources).toContain('const AUDIT_TABLE_CELL_CLASS = \'px-2.5 py-4 text-left text-[13px] leading-4 text-[#334155] align-middle\';');
        expect(auditSources).toContain('<tr className="h-12">');
        expect(auditSources).not.toContain('min-w-[760px]');
        expect(auditSources).not.toContain('additionalLines.map');
        expect(auditSources).toContain('{payloadFileName}');
        expect(auditSources).toContain('Copy audit payload');
        expect(auditSources).toContain('className={AUDIT_TABLE_ACTION_HEADER_CELL_CLASS}>Details</th>');
        expect(auditSources).not.toContain('Details &amp; JSON');
        expect(auditSources).toContain('AuditTimestampCell');
        expect(auditSources).toContain('audit-timestamp-value');
        expect(auditSources).not.toContain('payload.json');
        expect(auditSources).not.toContain('EVENT_OPTIONS');
        expect(auditSources).not.toContain('Filter audit event');
        expect(auditSources).not.toContain('Audit date from');
        expect(auditSources).not.toContain('Audit date to');
        expect(auditSources).not.toContain('{entry.action || \'VIEW\'} · {entry.entity_type || \'unknown\'}');
    });

    it('translates technical audit values into cashier-friendly labels', () => {
        expect(formatAuditEventLabel({
            event_type: 'status',
            entity_type: 'pos_device_bridge',
            action: 'VIEW'
        })).toBe('POS hardware checked');
        expect(formatAuditEventLabel({
            event_type: 'pos_transaction_voided',
            entity_type: 'pos_transaction',
            action: 'UPDATE'
        })).toBe('Voided order');
        expect(formatAuditEventLabel({
            event_type: 'unknown_event',
            entity_type: 'pos_discount',
            action: 'UPDATE'
        })).toBe('Updated discount');
        expect(formatAuditEventLabels({
            event_type: 'pos_discount_applied',
            entity_type: 'pos_discount',
            entity_id: 44,
            action: 'CREATE',
            changes: {
                transaction_id: 44,
                discount_type: 'manual',
                discount_amount: 25,
                authorized_by_name: 'manager-nine',
                cashier_name: 'cashier-seven'
            }
        }, [{ location_id: 1, name: 'Space Bar - Iloilo Main Branch' }])).toEqual([
            'Applied Other discount ₱25.00 to order #44',
            'Authorized by manager-nine',
            'Cashier: cashier-seven'
        ]);
    });

    it('derives the payload filename from the audit record', () => {
        expect(getAuditPayloadFileName({ event_type: 'terminal_logout' })).toBe('terminal_logout.json');
        expect(getAuditPayloadFileName({
            event_type: 'Delivery Run Members Added'
        })).toBe('delivery_run_members_added.json');
        expect(getAuditPayloadFileName({
            changes: { event: 'pos_transaction_voided' }
        })).toBe('pos_transaction_voided.json');
        expect(getAuditPayloadFileName({})).toBe('audit_event.json');
    });

    it('formats audit timestamps with a short month and a date-time divider', () => {
        expect(formatAuditDate('2026-06-15T12:34:56')).toBe('Jun 15, 2026 · 12:34:56 PM');
        expect(formatAuditDateParts('2026-06-15T12:34:56')).toEqual({
            date: 'Jun 15, 2026',
            time: '12:34:56 PM'
        });
    });

    it('converts structured audit changes into readable detail lines', () => {
        expect(formatAuditDetailLines({
            event_type: 'pos_parked_sale_created',
            entity_type: 'pos_parked_sale',
            changes: {
                event: 'pos_parked_sale_created',
                park_reference: 'PARK-DD47A99010AD',
                line_count: 2,
                total_amount: 175,
                terminal_id: 'JOHN-01',
                shift_id: 82,
                location_id: 1,
                access_token: 'must not be shown'
            }
        }, [{ location_id: 1, name: 'Space Bar - Iloilo Main Branch' }])).toEqual([
            'Park reference: PARK-DD47A99010AD',
            'Items: 2',
            'Total: ₱175.00',
            'Terminal: JOHN-01',
            'Shift: 82',
            'Location: Space Bar - Iloilo Main Branch'
        ]);
        expect(formatAuditDetailLines({
            entity_type: 'delivery_run',
            changes: {
                event: 'delivery_run_personnel_set',
                delivery_run_id: 2,
                personnel: [{ display_name: 'TEST QR' }]
            }
        })).toEqual([
            'Delivery Run: 2',
            'Personnel: TEST QR'
        ]);
        expect(formatAuditDetailLines({
            entity_type: 'delivery_run',
            changes: {
                event: 'delivery_run_personnel_set',
                personnel: [{ delivery_run_personnel_id: 8, delivery_personnel_id: null }]
            }
        })).toEqual(['Personnel: Delivery Run Personnel ID: 8']);
        expect(formatAuditDetailLines({
            changes: {
                event: 'unknown_event',
                empty_array: [],
                empty_object: {},
                empty_text: '   ',
                useful_value: 'kept'
            }
        })).toEqual(['Useful Value: Kept']);
        expect(formatAuditDetailLines({
            changes: {
                event: 'delivery_run_loading_confirmed',
                loading_summary: {
                    pending_count: 0,
                    loaded_count: 1,
                    not_loaded_count: 0,
                    exception_count: 0,
                    total_count: 1
                }
            }
        })).toEqual(['Loading Summary: Pending Count: 0 · Loaded Count: 1 · Not Loaded Count: 0 · Exception Count: 0 · Total Count: 1']);
        expect(getAuditAdditionalLines({
            request_id: 'request-1',
            actor: { email: 'cashier@example.com' },
            changes: {
                request_id: 'request-1',
                actor_email: 'cashier@example.com',
                terminal_id: 'COUNTER-01',
                note: 'Only this line remains'
            }
        })).toEqual(['Note: Only this line remains']);
        expect(getAuditAdditionalLines({
            actor: { email: 'cashier@example.com' },
            changes: {
                event: 'delivery_job_status_changed',
                pos_transaction_id: 50,
                delivery_run_id: 2,
                previous_status: 'picked_up',
                status: 'delivered',
                provider: 'Manual',
                shift_id: 2
            }
        })).toEqual(['Provider: Manual', 'Shift: 2']);
        expect(getAuditAdditionalLines({
            entity_type: 'delivery_job',
            changes: {
                event: 'delivery_run_member_loading_marked',
                pos_transaction_id: 50,
                previous_state: 'pending',
                current_state: 'loaded',
                has_exception_reason: false
            }
        })).toEqual(['Has Exception Reason: Disabled']);
        expect(getAuditAdditionalLines({
            entity_type: 'pos_transaction',
            changes: {
                event: 'delivery_cash_collected',
                pos_transaction_id: 50,
                payment_type: 'cash',
                payment_status: 'paid',
                payment_timing: 'on_delivery',
                cash_received: 195
            }
        })).toEqual(['Payment Type: Cash', 'Payment Timing: On Delivery', 'Cash Received: ₱195.00']);
        expect(getAuditReadableFields({
            entity_type: 'pos_transaction',
            changes: {
                event: 'delivery_cash_collected',
                pos_transaction_id: 50,
                payment_type: 'cash',
                payment_status: 'paid',
                payment_timing: 'on_delivery'
            }
        }).map(({ key, sourceKeys }) => ({ key, sourceKeys }))).toEqual([
            { key: 'order', sourceKeys: ['pos_transaction_id'] },
            { key: 'payment', sourceKeys: ['payment_status'] }
        ]);
    });

    it('renders every readable audit value as a consistent detail-card field', () => {
        const fields = getAuditReadableDetailFields({
            actor: { email: 'cashier@example.com' },
            entity_type: 'delivery_job',
            changes: {
                event: 'delivery_job_status_changed',
                pos_transaction_id: 51,
                status: 'pending_dispatch',
                provider: 'third_party_provider',
                delivery_personnel_name: 'TEST QR',
                assigned_by: 1,
                assigned_shift_id: 2,
                location_id: 3,
                assigned_at: '2026-10-02T15:21:27.000Z'
            }
        }, [{ location_id: 3, name: 'Ralph Restaurant Main' }]);

        expect(fields.every(({ label, value, Icon }) => label && value && Icon)).toBe(true);
        expect(fields.map(({ label }) => label)).toEqual(expect.arrayContaining([
            'Actor Email',
            'Order',
            'Status',
            'Provider',
            'Delivery Personnel',
            'Assigned By',
            'Assigned Shift ID',
            'Location',
            'Assigned At'
        ]));
        expect(fields.find(({ label }) => label === 'Order')?.value).toBe('#51');
        expect(fields.find(({ label }) => label === 'Status')?.value).toBe('Pending Dispatch');
        expect(fields.find(({ label }) => label === 'Provider')?.value).toBe('Third Party Provider');
        expect(fields.find(({ label }) => label === 'Assigned At')?.value).toBe(formatAuditDate('2026-10-02T15:21:27.000Z'));
        expect(fields.some(({ value }) => /[a-z]+_[a-z]+/i.test(value))).toBe(false);
        expect(fields.find(({ label }) => label === 'Location')?.value).toBe('Ralph Restaurant Main');
    });

    it('fills the row for one to three cards while capping the desktop layout at four columns', () => {
        expect(getAuditReadableDetailGridClassName(1)).toContain('lg:grid-cols-1');
        expect(getAuditReadableDetailGridClassName(2)).toContain('lg:grid-cols-2');
        expect(getAuditReadableDetailGridClassName(3)).toContain('lg:grid-cols-3');
        expect(getAuditReadableDetailGridClassName(4)).toContain('lg:grid-cols-4');
        expect(getAuditReadableDetailGridClassName(9)).toBe(getAuditReadableDetailGridClassName(4));
    });

    it('keeps cashier and shift identifiers as readable IDs instead of currency', () => {
        expect(formatAuditDetailLines({
            changes: {
                origin_cashier_id: 7,
                origin_shift_id: 81,
                previous_cashier_id: 1,
                previous_shift_id: 82,
                cashier_id: 1,
                shift_id: 82,
                claimed_terminal_id: 'JOHN-01'
            }
        })).toEqual([
            'Original cashier: User ID 7',
            'Original shift: 81',
            'Previous cashier: User ID 1',
            'Previous shift: 82',
            'Current cashier: User ID 1',
            'Shift: 82',
            'Claimed terminal: JOHN-01'
        ]);
    });

    it('shows cashier names alongside their stable user IDs when available', () => {
        expect(formatAuditDetailLines({
            cashier_names: {
                origin_cashier_id: 'Riotussuck',
                previous_cashier_id: 'John Cashier',
                cashier_id: 'John Cashier'
            },
            changes: {
                origin_cashier_id: 7,
                previous_cashier_id: 1,
                cashier_id: 1
            }
        })).toEqual([
            'Original cashier: Riotussuck (User ID: 7)',
            'Previous cashier: John Cashier (User ID: 1)',
            'Current cashier: John Cashier (User ID: 1)'
        ]);
    });

    it('groups readable details into five-record columns and continues in pairs of columns', () => {
        const groups = groupAuditDetailLines(Array.from({ length: 12 }, (_, index) => `Record ${index + 1}`));

        expect(groups).toEqual([
            {
                left: ['Record 1', 'Record 2', 'Record 3', 'Record 4', 'Record 5'],
                right: ['Record 6', 'Record 7', 'Record 8', 'Record 9', 'Record 10']
            },
            {
                left: ['Record 11', 'Record 12'],
                right: []
            }
        ]);
    });

    it('uses changed setting keys instead of a generic settings update label', () => {
        const labels = formatAuditEventLabels({
            entity_type: 'system_setting',
            action: 'UPDATE',
            event_type: 'settings_updated',
            changes: {
                event: 'settings_updated',
                setting_keys: ['storefront_hours', 'pos_best_seller_settings']
            }
        });

        expect(labels).toEqual([
            'Changed storefront hours',
            'Changed POS best-seller settings'
        ]);
        expect(formatAuditEventLabel({
            entity_type: 'system_setting',
            action: 'UPDATE',
            changes: { setting_keys: ['storefront_hours'] }
        })).toBe('Changed storefront hours');
    });

    it('uses changed catalog fields and concrete POS event names', () => {
        expect(formatAuditEventLabels({
            entity_type: 'item_storefront_catalog_override',
            action: 'UPDATE',
            changes: {
                storefront_visible: true,
                location_availability: [{ location_id: 1, storefront_available: true }]
            }
        })).toEqual([
            'Made item visible on storefront',
            'Set item availability: location #1 available'
        ]);
        expect(formatAuditEventLabel({
            entity_type: 'pos_sale_session',
            action: 'UPDATE',
            changes: { event: 'retrieved' }
        })).toBe('Resumed parked sale');
        expect(formatAuditEventLabel({
            entity_type: 'pos_parked_sale',
            action: 'UPDATE',
            changes: {
                event: 'pos_parked_sale_resumed',
                park_reference: 'PARK-ABC123',
                previous_cashier_id: 15,
                cashier_id: 22
            }
        })).toBe('Resumed parked sale PARK-ABC123 from cashier #15 to cashier #22');
        expect(formatAuditEventLabel({
            entity_type: 'delivery_job',
            action: 'UPDATE',
            changes: {
                event: 'delivery_job_status_changed',
                pos_transaction_id: 89,
                previous_status: 'assigned',
                status: 'picked_up'
            }
        })).toBe('Changed delivery status for order #89 from Assigned to Picked Up');
        expect(formatAuditEventLabels({
            entity_type: 'delivery_job',
            action: 'UPDATE',
            changes: {
                event: 'delivery_personnel_assigned',
                pos_transaction_id: 89,
                delivery_personnel_name: 'Joshy Josh',
                previous_status: 'pending_dispatch',
                status: 'assigned'
            }
        })).toEqual([
            'Changed delivery status for order #89 from Pending Dispatch to Assigned',
            'Assigned Joshy Josh to order #89'
        ]);
        expect(formatAuditEventLabel({
            entity_type: 'delivery_run',
            action: 'UPDATE',
            changes: {
                event: 'delivery_run_members_added',
                delivery_run_id: 2,
                pos_transaction_ids: [51]
            }
        })).toBe('Added orders #51 to delivery run');
        expect(formatAuditEventLabel({
            entity_type: 'delivery_job',
            action: 'UPDATE',
            changes: {
                event: 'delivery_run_member_loading_marked',
                pos_transaction_id: 50,
                previous_state: 'pending',
                current_state: 'loaded'
            }
        })).toBe('Marked order #50 as Loaded');
        expect(formatAuditEventLabel({
            entity_type: 'pos_transaction',
            action: 'UPDATE',
            changes: {
                event: 'delivery_cash_collected',
                pos_transaction_id: 50,
                cash_received: 195
            }
        })).toBe('Collected ₱195.00 cash for delivery order #50');
        expect(formatAuditEventLabel({
            entity_type: 'unknown_entity',
            action: 'UPDATE',
            changes: { event: 'cash_drawer_event_recorded' }
        })).toBe('Cash drawer activity recorded');
        expect(formatAuditEventLabel({
            entity_type: 'unknown_entity',
            action: 'UPDATE',
            changes: { event: 'pos_attendance_started_with_takeover' }
        })).toBe('Attendance started with takeover');
    });

    it('does not collapse an event with a technical name into system activity', () => {
        expect(formatAuditEventLabel({
            entity_type: 'unknown_entity',
            action: 'UPDATE',
            event_type: 'custom_setting_changed'
        })).toBe('Custom Setting Changed');
    });

    it('describes item cost, image, and POS catalog changes precisely', () => {
        expect(formatAuditEventLabels({
            entity_type: 'item',
            entity_id: 18,
            event_type: 'item_updated',
            action: 'UPDATE',
            changes: {
                item_id: 18,
                item_name: 'Chicken Meal',
                changed_fields: {
                    cost_per_unit: { from: 45, to: 52.5 },
                    default_sale_price: { from: 90, to: 99 }
                }
            }
        })).toEqual([
            'Changed cost for Chicken Meal from ₱45.00 to ₱52.50',
            'Changed sale price for Chicken Meal from ₱90.00 to ₱99.00'
        ]);
        expect(formatAuditEventLabel({
            entity_type: 'item_catalog_image',
            entity_id: 18,
            event_type: 'item_catalog_image_uploaded',
            action: 'CREATE',
            changes: { item_id: 18, item_name: 'Chicken Meal', replaced_existing_image: true }
        })).toBe('Replaced image for Chicken Meal');
        expect(formatAuditEventLabels({
            entity_type: 'pos_catalog_override',
            entity_id: 18,
            event_type: 'pos_catalog_override_updated',
            action: 'UPDATE',
            changes: { item_id: 18, item_name: 'Chicken Meal', pos_visible: true, pos_always_available: false }
        })).toEqual([
            'Made Chicken Meal visible in POS',
            'Disabled always available for Chicken Meal'
        ]);
    });

    it('does not show generic update labels for legacy records without event details', () => {
        expect(formatAuditEventLabel({
            entity_type: 'pos_terminal_shift',
            action: 'UPDATE',
            event_type: 'pos_terminal_shift.update'
        })).toBe('Shift event details unavailable');
        expect(formatAuditEventLabel({
            entity_type: 'delivery_job',
            action: 'UPDATE',
            event_type: 'delivery_job.update'
        })).toBe('Delivery event details unavailable');
        expect(formatAuditEventLabel({
            entity_type: 'pos_parked_sale',
            action: 'UPDATE',
            event_type: 'pos_parked_sale_reparked'
        })).toBe('Saved parked sale');
    });
});
