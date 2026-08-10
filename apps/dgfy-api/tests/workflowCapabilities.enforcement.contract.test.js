import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALL_WORKFLOW_CAPABILITIES } from '../src/modules/shared/constants/workflowModes.js';
import { CAPABILITY_TAXONOMY_OVERLAY_MODES } from '../src/modules/shared/constants/modeItemTaxonomy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.join(__dirname, '../src/routes');

const readRouteGateCapabilities = () => {
    const capabilities = new Set();
    for (const file of fs.readdirSync(ROUTES_DIR)) {
        if (!file.endsWith('.js')) continue;
        const source = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
        for (const match of source.matchAll(/requireWorkflowCapability\(\s*'([^']+)'/g)) {
            capabilities.add(match[1]);
        }
    }
    return capabilities;
};

describe('workflow capability enforcement contract', () => {
    it('keeps every declared capability read by a real guard', () => {
        const routeGated = readRouteGateCapabilities();
        const taxonomyEnforced = new Set(Object.keys(CAPABILITY_TAXONOMY_OVERLAY_MODES));

        const unreadCapabilities = ALL_WORKFLOW_CAPABILITIES.filter(
            (capability) => !routeGated.has(capability) && !taxonomyEnforced.has(capability)
        );

        // A capability that no route gate and no taxonomy overlay reads is
        // decorative: it grants nothing, blocks nothing, and misleads anyone
        // reading WORKFLOW_MODE_CAPABILITIES. Either wire it to a guard or
        // delete it from the vocabulary.
        expect(unreadCapabilities).toEqual([]);
    });

    it('keeps every route gate referencing a declared capability', () => {
        const routeGated = readRouteGateCapabilities();
        const undeclared = [...routeGated].filter(
            (capability) => !ALL_WORKFLOW_CAPABILITIES.includes(capability)
        );

        expect(undeclared).toEqual([]);
    });
});
