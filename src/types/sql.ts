export type SqlValue = string | number | null;

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  nullable?: boolean;
  description?: string;
}

export interface TableSchema {
  name: string;
  label: string;
  description: string;
  columns: ColumnSchema[];
  rows: Array<Record<string, SqlValue>>;
}

export interface DataTable {
  columns: ColumnSchema[];
  rows: Array<Record<string, SqlValue>>;
}

export interface DatabaseSchema {
  name: string;
  label: string;
  tables: TableSchema[];
}

export interface QueryColumn {
  name: string;
  label: string;
  /** 投影前的源字段名，用于列级权限掩码判定 */
  source: string;
  type: ColumnSchema['type'];
}

export interface QueryResult {
  columns: QueryColumn[];
  /** 修订快照下的原始行（未掩码），展示/复制/导出时按角色再掩码 */
  rows: Array<Record<string, SqlValue>>;
  rowCount: number;
  totalMatched: number;
  elapsedMs: number;
  sql: string;
  truncated: boolean;
  /** 结果所依据的数据源修订号 */
  revision: number;
  /** 是否已被整表复制 / CSV 导出（导出后快照即定稿，不再随修订重算） */
  exported: boolean;
  executedAt: number;
}

export interface QuerySession {
  id: string;
  title: string;
  sql: string;
  updatedAt: number;
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: number;
  elapsedMs: number;
  rowCount: number;
  success: boolean;
  error?: string;
  /** 该次执行所依据的数据源修订号 */
  revision?: number;
}

export interface FavoriteQuery {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
}

export interface QueryErrorDetail {
  code: string;
  message: string;
  hint: string;
  line: number;
  column: number;
}
