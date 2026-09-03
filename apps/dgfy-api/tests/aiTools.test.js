/**
 * AI Tools Validation Tests
 *
 * These tests ensure consistency between:
 * - Tool definitions in aiTools.js
 * - Tool handlers in aiToolExecutor.js
 *
 * Run with: npm test -- --testPathPatterns=aiTools
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the actual tool definitions
import { AI_TOOLS, TOOL_CATEGORIES, TOOL_PERMISSIONS } from '../src/config/aiTools.js';

describe('AI Tools Configuration', () => {
  describe('Tool Definitions', () => {
    test('should have at least 30 tools defined', () => {
      expect(AI_TOOLS.length).toBeGreaterThanOrEqual(30);
    });

    test('every tool should have a unique name', () => {
      const names = AI_TOOLS.map(t => t.function?.name).filter(Boolean);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    test('company-token registration link tool is retired', () => {
      const names = AI_TOOLS.map(t => t.function?.name).filter(Boolean);
      expect(names).not.toContain('get_company_join_link');
    });

    test('every tool should have required fields', () => {
      for (const tool of AI_TOOLS) {
        expect(tool).toHaveProperty('type', 'function');
        expect(tool).toHaveProperty('function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function.name).toBeTruthy();
        expect(tool.function).toHaveProperty('description');
        expect(tool.function.description.length).toBeGreaterThan(10);
        expect(tool.function).toHaveProperty('parameters');
      }
    });

    test('every tool should have a valid category', () => {
      const validCategories = Object.values(TOOL_CATEGORIES);

      for (const tool of AI_TOOLS) {
        expect(tool).toHaveProperty('category');
        expect(validCategories).toContain(tool.category);
      }
    });

    test('write tools should require confirmation', () => {
      const writeTools = AI_TOOLS.filter(t => t.category === TOOL_CATEGORIES.WRITE);

      for (const tool of writeTools) {
        expect(tool.requiresConfirmation).toBe(true);
      }
    });

    test('read tools should not require confirmation', () => {
      const readTools = AI_TOOLS.filter(t => t.category === TOOL_CATEGORIES.READ);

      for (const tool of readTools) {
        expect(tool.requiresConfirmation).toBeFalsy();
      }
    });

    test('import tools should require confirmation', () => {
      const importExportTools = AI_TOOLS.filter(t => t.category === TOOL_CATEGORIES.IMPORT_EXPORT);
      const importTools = importExportTools.filter(t => t.function.name.includes('import'));

      for (const tool of importTools) {
        expect(tool.requiresConfirmation).toBe(true);
      }
    });

    test('tools with requiredRole should have valid roles', () => {
      const validRoles = ['staff', 'manager', 'admin'];

      for (const tool of AI_TOOLS) {
        if (tool.requiredRole) {
          expect(validRoles).toContain(tool.requiredRole);
        }
      }
    });
  });

  describe('Tool Parameters', () => {
    test('all parameters should have descriptions', () => {
      for (const tool of AI_TOOLS) {
        const params = tool.function.parameters?.properties || {};

        for (const [paramName, paramSchema] of Object.entries(params)) {
          expect(paramSchema).toHaveProperty('description');
          expect(paramSchema.description.length).toBeGreaterThan(5);
        }
      }
    });

    test('all parameters should have types', () => {
      for (const tool of AI_TOOLS) {
        const params = tool.function.parameters?.properties || {};

        for (const [paramName, paramSchema] of Object.entries(params)) {
          expect(paramSchema).toHaveProperty('type');
          expect(['string', 'integer', 'number', 'boolean', 'array', 'object']).toContain(paramSchema.type);
        }
      }
    });

    test('required parameters should be listed in required array', () => {
      for (const tool of AI_TOOLS) {
        const required = tool.function.parameters?.required || [];
        const properties = Object.keys(tool.function.parameters?.properties || {});

        // All required params should exist in properties
        for (const req of required) {
          expect(properties).toContain(req);
        }
      }
    });
  });

  describe('Tool Handler Coverage', () => {
    let executorContent;

    beforeAll(() => {
      const executorPath = path.join(__dirname, '../src/services/aiToolExecutor.js');
      const executeUseCasePath = path.join(__dirname, '../src/modules/ai/usecases/executeAiToolUseCase.js');
      executorContent = [
        fs.readFileSync(executorPath, 'utf8'),
        fs.readFileSync(executeUseCasePath, 'utf8')
      ].join('\n');
    });

    test('every defined tool should have a handler in AI execution coverage', () => {
      const missingHandlers = [];

      for (const tool of AI_TOOLS) {
        const toolName = tool.function.name;
        // Check for case statement
        const casePattern = new RegExp(`case\\s+['"]${toolName}['"]\\s*:`);

        if (!casePattern.test(executorContent)) {
          missingHandlers.push(toolName);
        }
      }

      if (missingHandlers.length > 0) {
        console.error('Missing handlers for:', missingHandlers);
      }

      expect(missingHandlers).toHaveLength(0);
    });
  });

  describe('Tool Categories', () => {
    test('TOOL_CATEGORIES should have all required categories', () => {
      expect(TOOL_CATEGORIES).toHaveProperty('READ');
      expect(TOOL_CATEGORIES).toHaveProperty('WRITE');
      expect(TOOL_CATEGORIES).toHaveProperty('ANALYSIS');
      expect(TOOL_CATEGORIES).toHaveProperty('IMPORT_EXPORT');
    });
  });

  describe('Tool Permissions', () => {
    test('TOOL_PERMISSIONS should define access for all roles', () => {
      expect(TOOL_PERMISSIONS).toHaveProperty('staff');
      expect(TOOL_PERMISSIONS).toHaveProperty('manager');
      expect(TOOL_PERMISSIONS).toHaveProperty('admin');
    });

    test('staff should only have read and analysis access', () => {
      expect(TOOL_PERMISSIONS.staff).toContain('read');
      expect(TOOL_PERMISSIONS.staff).toContain('analysis');
      expect(TOOL_PERMISSIONS.staff).not.toContain('write');
    });

    test('manager and admin should have full access', () => {
      const fullAccess = ['read', 'write', 'analysis', 'import_export'];

      for (const category of fullAccess) {
        expect(TOOL_PERMISSIONS.manager).toContain(category);
        expect(TOOL_PERMISSIONS.admin).toContain(category);
      }
    });
  });

  describe('Tool Statistics', () => {
    test('should report correct tool counts by category', () => {
      const counts = {};

      for (const tool of AI_TOOLS) {
        const cat = tool.category || 'unknown';
        counts[cat] = (counts[cat] || 0) + 1;
      }

      // Log for visibility
      console.log('Tool counts by category:', counts);
      console.log('Total tools:', AI_TOOLS.length);

      // Basic sanity checks
      expect(counts[TOOL_CATEGORIES.READ]).toBeGreaterThan(0);
      expect(counts[TOOL_CATEGORIES.WRITE]).toBeGreaterThan(0);
      expect(counts[TOOL_CATEGORIES.ANALYSIS]).toBeGreaterThan(0);
    });
  });
});
