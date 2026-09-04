import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(__dirname, '../components/DeliveryAssignmentControl.jsx');
const servicePath = path.resolve(__dirname, '../services/posService.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

describe('manual delivery assignment UI contract', () => {
  it('requires an active shift, POS transact permission, and a picked/typed name before saving', () => {
    expect(componentSource).toContain('Open a shift before assigning delivery personnel.');
    expect(componentSource).toContain('POS transact permission is required to assign delivery personnel.');
    // Phase 205 (#1080): a datalist-backed free-text input replaced the plain free-text field --
    // ADR 0034's 2026-08-12 amendment still requires the free-text fallback to keep working.
    expect(componentSource).toContain('Pick a registered rider or type a name');
    expect(componentSource).toContain('Pick a registered rider or type a third-party courier name.');
    expect(componentSource).toContain('Mark the order as Out for Delivery before assigning delivery personnel.');
    expect(componentSource).toContain('matchedRegistryEntry');
    expect(componentSource).toContain('{ id: matchedRegistryEntry.delivery_personnel_id }');
    expect(componentSource).toContain('{ name: normalizedPersonnelName }');
    expect(componentSource).toContain('type="text"');
    expect(componentSource).not.toContain('<select');
  });

  it('keeps provider-owned jobs read-only and uses the assignment API', () => {
    expect(componentSource).toContain('Delivery is managed by the external provider.');
    expect(serviceSource).toContain('delivery-job/assignment');
  });
});
