// Phase 296 diagnostic: runs the current Items predicate against a bounded fixture.
// This is source-level evidence, not a browser, database, or production test.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx'), 'utf8');
const start = source.indexOf('  const filteredItems = useMemo(() => {');
const end = source.indexOf('  }, [categoryFilter, primaryBarcodes, searchQuery, sortedItems, stockFilter]);', start);
assert(start >= 0 && end > start, 'Items predicate changed; update or retire this diagnostic');
assert(source.includes('fetchPosCatalog({ limit: 200 })'), 'Unfiltered 200-row loader changed; update or retire this diagnostic');
const predicate = new Function('sortedItems', 'searchQuery', 'categoryFilter', 'stockFilter', 'primaryBarcodes', 'isServiceCatalogItem', 'normalizeFolderNameKey', source.slice(start + '  const filteredItems = useMemo(() => {'.length, end));
const rows = Array.from({ length: 600 }, (_, i) => ({ item_id: i + 1, name: `A product ${String(i + 1).padStart(3, '0')}`, sku_code: `SKU-${i + 1}`, current_stock: 10, pos_visible: true }));
rows.push({ item_id: 601, name: 'Tomato Meatballs', sku_code: 'MEAT-601', current_stock: 10, pos_visible: true });
const filter = (items) => predicate(items, 'meat', 'all', 'all', {}, () => false, (s) => String(s).toLowerCase());
const itemsResults = filter(rows.slice(0, 200));
const fullResults = filter(rows);
// Model the inspected repository's name/SKU WHERE-before-LIMIT for this ASCII fixture.
const sellResults = rows.filter((r) => /meat/i.test(r.name) || /meat/i.test(r.sku_code)).slice(0, 200);
assert.deepEqual(itemsResults.map((r) => r.item_id), []);
assert.deepEqual(fullResults.map((r) => r.item_id), [601]);
assert.deepEqual(sellResults.map((r) => r.item_id), [601]);
console.log(JSON.stringify({ evidence: 'source-predicate fixture; API ordering modeled, not executed', rows: rows.length, items: itemsResults.map((r) => r.item_id), sell: sellResults.map((r) => r.item_id), completeSearch: fullResults.map((r) => r.item_id), defectReproduced: true }, null, 2));
