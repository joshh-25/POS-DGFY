import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(__dirname, '../components/DeliveryAssignmentControl.jsx');
const servicePath = path.resolve(__dirname, '../services/posService.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

describe('manual delivery assignment UI contract', () => {
  it('requires an active shift, POS transact permission, and a selected person before saving', () => {
    expect(componentSource).toContain('Open a shift before assigning delivery personnel.');
    expect(componentSource).toContain('POS transact permission is required to assign delivery personnel.');
    expect(componentSource).toContain('Select delivery personnel');
    expect(componentSource).toContain('Mark the order as Out for Delivery before assigning delivery personnel.');
    expect(componentSource).toContain('onAssign(normalizedOrderId, Number(selectedPersonnelId))');
  });

  it('keeps provider-owned jobs read-only and uses the assignment API', () => {
    expect(componentSource).toContain('Delivery is managed by the external provider.');
    expect(serviceSource).toContain("api.get('/pos/delivery-personnel'");
    expect(serviceSource).toContain('delivery-job/assignment');
  });
});
