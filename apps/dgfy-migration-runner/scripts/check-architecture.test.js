import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { scanForDirectSequelizeConstruction } from './check-architecture.js';

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relativePath, content) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
}

test('passes cleanly against the real current migration-runner tree', () => {
    const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

    const { fileCount, violations } = scanForDirectSequelizeConstruction({
        srcRoot: path.join(packageRoot, 'src')
    });

    assert.equal(violations.length, 0, violations.join('\n'));
    assert.ok(fileCount > 0, 'expected at least one .js file to be scanned');
});

test('src/config/db.js itself is exempt from the direct-construction rule', () => {
    const root = makeTempDir('migration-runner-arch-exempt-');
    try {
        writeFile(root, 'src/config/db.js', "export function createSourceConnection() { return new Sequelize('a', 'b', 'c', {}); }\n");

        const { violations } = scanForDirectSequelizeConstruction({ root, srcRoot: path.join(root, 'src') });

        assert.deepEqual(violations, []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('flags a direct `new Sequelize(` construction outside src/config/db.js', () => {
    const root = makeTempDir('migration-runner-arch-violation-');
    try {
        writeFile(root, 'src/config/db.js', 'export function createSourceConnection() {}\n');
        writeFile(root, 'src/commands/rogue.js', "import { Sequelize } from 'sequelize';\nexport function rogue() { return new Sequelize('x', 'y', 'z', {}); }\n");

        const { violations } = scanForDirectSequelizeConstruction({ root, srcRoot: path.join(root, 'src') });

        assert.equal(violations.length, 1);
        assert.match(violations[0], /src\/commands\/rogue\.js/);
        assert.match(violations[0], /constructs `new Sequelize\(` directly/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('clean tree with no Sequelize construction produces zero violations', () => {
    const root = makeTempDir('migration-runner-arch-clean-');
    try {
        writeFile(root, 'src/config/db.js', 'export function noop() {}\n');
        writeFile(root, 'src/utils/errors.js', 'export class MyError extends Error {}\n');

        const { fileCount, violations } = scanForDirectSequelizeConstruction({ root, srcRoot: path.join(root, 'src') });

        assert.equal(fileCount, 2);
        assert.deepEqual(violations, []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
