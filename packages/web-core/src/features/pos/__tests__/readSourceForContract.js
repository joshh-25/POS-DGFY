import { readFileSync } from 'node:fs';

// Source-contract tests compare multiline snippets. Normalize checkout line
// endings so the contract is portable across Windows and Unix worktrees.
export const readSourceForContract = (filePath) => readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
