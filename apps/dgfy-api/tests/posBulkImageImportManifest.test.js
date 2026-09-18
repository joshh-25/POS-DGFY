import { parsePosBulkImageImportManifest as parse } from '../src/modules/pos/domain/posBulkImageImportManifest.js';

const header = 'sku_code,image_filename,replace_existing\n';

describe('POS image package manifest', () => {
    it('accepts BOM, quoted filenames and explicit replacement decisions', () => {
        expect(parse('\ufeff' + header + 'MASU-022,"meal, large.jpg",true\nMASU-026,beef.webp,false')).toEqual([
            { sku_code: 'MASU-022', image_filename: 'meal, large.jpg', replace_existing: true },
            { sku_code: 'MASU-026', image_filename: 'beef.webp', replace_existing: false }
        ]);
    });
    it('accepts 500 unique mappings and rejects the 501st', () => {
        const rows = Array.from({ length: 501 }, (_, index) => `SKU-${index},image-${index}.png,false`);
        expect(parse(header + rows.slice(0, 500).join('\n'))).toHaveLength(500);
        expect(() => parse(header + rows.join('\n'))).toThrow('between 1 and 500');
    });
    it.each(['../meal.jpg', 'C:\\meal.jpg', '/meal.jpg', 'folder/meal.jpg', 'meal.svg', 'meal.zip', 'meal.jpg:stream'])('rejects unsafe filename %s', (name) => {
        expect(() => parse(header + `SKU,${name},false`)).toThrow('Invalid image filename');
    });
    it('rejects duplicate SKU and filename identities regardless of case', () => {
        expect(() => parse(header + 'sku,a.jpg,false\nSKU,b.jpg,true')).toThrow('Duplicate SKU');
        expect(() => parse(header + 'sku,A.jpg,false\nother,a.jpg,true')).toThrow('Duplicate image');
    });
    it('does not infer replacement or silently accept malformed rows', () => {
        expect(() => parse(header + 'sku,a.jpg,')).toThrow('Replacement');
        expect(() => parse(header + 'sku,a.jpg,true,extra')).toThrow();
        expect(() => parse('sku_code,image_filename\nsku,a.jpg')).toThrow('headers');
        expect(() => parse(header)).toThrow('between 1 and 500');
    });
    it('rejects oversized manifests before parsing', () => {
        expect(() => parse(header + 'x'.repeat(1024 * 1024))).toThrow('exceeds 1 MiB');
    });
});
