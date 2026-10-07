import { create } from 'zustand';
import type { ColumnSchema, DataTable, SqlValue } from '../types/sql';
import { SEED_TABLES } from './seedData';
export interface BatchRecord {
  id: string;
  /** 该批次落库后数据源所处的修订号 */
  revision: number;
  description: string;
  appliedAt: number;
  affectedTables: string[];
  affectedRows: number;
  kind: 'append' | 'correct' | 'other';
}

export interface Snapshot {
  revision: number;
  columns: ColumnSchema[];
  rows: Array<Record<string, SqlValue>>;
}

interface DataSourceState {
  /** 数据源当前修订号，每次批次落库递增 */
  revision: number;
  tables: Record<string, DataTable>;
  batches: BatchRecord[];
  /** 取某张表在当前修订下的不可变快照 */
  getSnapshot: (tableName: string) => Snapshot;
  /** 在可变草稿上执行一批变更，落库后修订号 +1 */
  commitBatch: (
    description: string,
    kind: BatchRecord['kind'],
    mutate: (draft: Record<string, DataTable>) => { affectedTables: string[]; affectedRows: number },
  ) => BatchRecord;
}

/** 冻结表结构与每一行，保证快照在修订前进后仍不可变 */
function freezeTable(table: DataTable): DataTable {
  const rows = table.rows.map((row) => Object.freeze({ ...row }));
  return {
    columns: table.columns,
    // 运行时冻结以保证快照不可变；类型上仍保留可写以兼容批次草稿
    rows: Object.freeze(rows) as Array<Record<string, SqlValue>>,
  };
}

/** 复制出一份可变草稿（不冻结），供批次变更使用 */
function cloneTablesMutable(tables: Record<string, DataTable>): Record<string, DataTable> {
  const draft: Record<string, DataTable> = {};
  for (const [name, table] of Object.entries(tables)) {
    draft[name] = { columns: table.columns, rows: table.rows.map((row) => ({ ...row })) };
  }
  return draft;
}

const frozenSeedTables: Record<string, DataTable> = Object.fromEntries(
  Object.entries(SEED_TABLES).map(([name, table]) => [name, freezeTable(table)]),
);

export const useDataSourceStore = create<DataSourceState>((set, get) => ({
  revision: 1,
  tables: frozenSeedTables,
  batches: [],
  getSnapshot: (tableName) => {
    const table = get().tables[tableName];
    if (!table) {
      throw new Error(`数据表 ${tableName} 不存在`);
    }
    return { revision: get().revision, columns: table.columns, rows: table.rows };
  },
  commitBatch: (description, kind, mutate) => {
    const state = get();
    const draft = cloneTablesMutable(state.tables);
    const { affectedTables, affectedRows } = mutate(draft);
    const revision = state.revision + 1;
    const frozen: Record<string, DataTable> = {};
    for (const [name, table] of Object.entries(draft)) {
      frozen[name] = freezeTable(table);
    }
    const record: BatchRecord = {
      id: crypto.randomUUID(),
      revision,
      description,
      appliedAt: Date.now(),
      affectedTables,
      affectedRows,
      kind,
    };
    set({ revision, tables: frozen, batches: [record, ...state.batches].slice(0, 50) });
    return record;
  },
}));

/** 非 React 场景读取快照 */
export function getSnapshot(tableName: string): Snapshot {
  return useDataSourceStore.getState().getSnapshot(tableName);
}

export function getRevision(): number {
  return useDataSourceStore.getState().revision;
}

/** React 订阅数据源修订号 */
export function useDataSourceRevision(): number {
  return useDataSourceStore((state) => state.revision);
}
