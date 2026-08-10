import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const repositorySource = readFileSync(
  new URL('../src/modules/pos/repositories/posRepository.js', import.meta.url),
  'utf8'
);
const lineModelSource = readFileSync(
  new URL('../src/models/PosTransactionLine.js', import.meta.url),
  'utf8'
);

describe('POS governed discount line allocation contract', () => {
  it('uses the PosTransactionLine primary key defined by the model', () => {
    expect(lineModelSource).toContain('line_id: {');
    expect(lineModelSource).toContain('primaryKey: true');
    expect(repositorySource).toContain("order: [['line_id', 'ASC']]");
    expect(repositorySource).toContain('transaction_line_id: line.line_id');
    expect(repositorySource).not.toContain("order: [['pos_transaction_line_id', 'ASC']]");
    expect(repositorySource).not.toContain('transaction_line_id: line.pos_transaction_line_id');
  });
});
