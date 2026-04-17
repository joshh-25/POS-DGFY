import { buildTableRisk, normalizeIndexRows } from '../scripts/audit-tenant-index-headroom.js';

describe('tenant index headroom audit helpers', () => {
  it('normalizes index rows into ordered index definitions', () => {
    const rows = [
      {
        TABLE_NAME: 'items',
        INDEX_NAME: 'idx_items_sku',
        NON_UNIQUE: 0,
        INDEX_TYPE: 'BTREE',
        SEQ_IN_INDEX: 2,
        COLUMN_NAME: 'tenant_id',
        SUB_PART: null,
        COLLATION: 'A'
      },
      {
        TABLE_NAME: 'items',
        INDEX_NAME: 'idx_items_sku',
        NON_UNIQUE: 0,
        INDEX_TYPE: 'BTREE',
        SEQ_IN_INDEX: 1,
        COLUMN_NAME: 'sku',
        SUB_PART: null,
        COLLATION: 'A'
      }
    ];

    const normalized = normalizeIndexRows(rows);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].columns.map((col) => col.column_name)).toEqual(['sku', 'tenant_id']);
    expect(normalized[0].signature).toContain('UNIQUE');
  });

  it('detects redundant groups and warning status by index count', () => {
    const indexes = [
      {
        table_name: 'users',
        index_name: 'email',
        non_unique: 0,
        index_type: 'BTREE',
        columns: [{ column_name: 'email', sub_part: null, collation: 'A' }],
        signature: 'UNIQUE::BTREE::email::'
      },
      {
        table_name: 'users',
        index_name: 'email_2',
        non_unique: 0,
        index_type: 'BTREE',
        columns: [{ column_name: 'email', sub_part: null, collation: 'A' }],
        signature: 'UNIQUE::BTREE::email::'
      },
      {
        table_name: 'users',
        index_name: 'idx_users_role',
        non_unique: 1,
        index_type: 'BTREE',
        columns: [{ column_name: 'role', sub_part: null, collation: 'A' }],
        signature: 'INDEX::BTREE::role::'
      }
    ];

    const risk = buildTableRisk({
      tableName: 'users',
      indexes,
      warnThreshold: 3,
      criticalThreshold: 64
    });

    expect(risk.status).toBe('warning');
    expect(risk.redundant_group_count).toBe(1);
    expect(risk.numbered_suffix_duplicates).toEqual([
      {
        index_name: 'email_2',
        base_index_name: 'email'
      }
    ]);
  });
});

