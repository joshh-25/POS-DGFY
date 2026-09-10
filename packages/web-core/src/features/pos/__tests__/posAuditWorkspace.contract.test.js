import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAuditDetailLines, formatAuditEventLabel, formatAuditEventLabels, groupAuditDetailLines } from '../components/AuditWorkspacePanel.jsx';

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
    });

    it('uses the tenant audit endpoint and includes the requested POS events', () => {
        const service = read('src/features/pos/services/auditService.js');
        const panel = read('src/features/pos/components/AuditWorkspacePanel.jsx');

        expect(service).toContain("api.get('/audit'");
        expect(panel).toContain('POS hardware checked');
        expect(panel).toContain('formatAuditEventLabel');
        expect(panel).toContain('Search all audit events, orders, images, users...');
        expect(panel).not.toContain('EVENT_OPTIONS');
        expect(panel).not.toContain('Filter audit event');
        expect(panel).not.toContain('Audit date from');
        expect(panel).not.toContain('Audit date to');
        expect(panel).not.toContain('{entry.action || \'VIEW\'} · {entry.entity_type || \'unknown\'}');
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
    });

    it('does not collapse an event with a technical name into system activity', () => {
        expect(formatAuditEventLabel({
            entity_type: 'unknown_entity',
            action: 'UPDATE',
            event_type: 'custom_setting_changed'
        })).toBe('Audit event: Custom Setting Changed');
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
