import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compliancePanelPath = path.resolve(__dirname, '../components/ComplianceProgramPanel.jsx');

describe('ComplianceProgramPanel contracts', () => {
  let content = '';

  beforeAll(() => {
    content = fs.readFileSync(compliancePanelPath, 'utf8');
  });

  it('derives next blocking step and unresolved requirement guidance from checklist metadata', () => {
    expect(content).toContain("const nextBlockingStepKey = String(checklist.next_blocking_step || '').trim();");
    expect(content).toContain('const nextBlockingStepMeta = STEP_META[nextBlockingStepKey] || null;');
    expect(content).toContain("final_review: { title: 'Final Review', actionTarget: '#section-final-review' }");
    expect(content).toContain('id="section-final-review"');
    expect(content).toContain("Next blocking step: <strong>{nextBlockingStepMeta.title}</strong>");
    expect(content).toContain("unresolved requirement{unresolvedRequirementCount === 1 ? '' : 's'}");
  });
});
