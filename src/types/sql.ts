export type SqlValue = string | number | null;

export type RoleId = 'admin' | 'analyst' | 'ops';

export type BatchKind = 'backfill' | 'correction';

export interface BatchRecord {
  id: string;
  revision: number;
  kind: BatchKind;
  label: string;
  detail: string;
  affectedRows: number;
  appliedAt: number;
}

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

export interface DatabaseSchema {
  name: string;
  label: string;
  tables: TableSchema[];
}

export interface QueryColumn {
  name: string;
  label: string;
  type: ColumnSchema['type'];
  masked?: boolean;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Array<Record<string, SqlValue>>;
  rowCount: number;
  totalMatched: number;
  elapsedMs: number;
  sql: string;
  truncated: boolean;
  /** 本次执行所基于的数据修订号（快照口径） */
  revision: number;
  /** 本次执行使用的角色，决定列掩码口径 */
  role: RoleId;
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
  /** 执行时的数据修订号，用于回溯口径 */
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
