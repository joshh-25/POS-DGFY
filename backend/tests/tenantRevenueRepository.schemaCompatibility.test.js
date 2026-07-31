import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryPath = path.resolve(
  currentDirectory,
  '../src/modules/tenantRevenue/repositories/tenantRevenueRepository.js'
);

describe('Tenant revenue repository schema compatibility', () => {
  it('selects only columns that exist on the landlord Tenant model', () => {
    const source = fs.readFileSync(repositoryPath, 'utf8');

    expect(source).not.toMatch(
      /model:\s*db\.Tenant[\s\S]*?attributes:\s*\[[^\]]*['"]slug['"][^\]]*\]/
    );
    expect(source).toContain("attributes: ['id', 'name']");
  });
});
