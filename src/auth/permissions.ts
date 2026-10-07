import type { ColumnSchema, SqlValue } from '../types/sql';

export type Role = 'ops' | 'analyst' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  ops: '运营',
  analyst: '分析师',
  viewer: '访客',
};

export const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'ops', label: '运营 · 可见全部列' },
  { value: 'analyst', label: '分析师 · 客户名/负责人掩码' },
  { value: 'viewer', label: '访客 · 金额等敏感列掩码' },
];

/** 各角色按源列名配置的掩码列 */
const MASKED_SOURCE_COLUMNS: Record<Role, string[]> = {
  ops: [],
  analyst: ['customer_name', 'owner'],
  viewer: ['customer_name', 'owner', 'amount'],
};

export function isColumnMasked(sourceColumn: string, role: Role): boolean {
  return MASKED_SOURCE_COLUMNS[role].includes(sourceColumn);
}

/**
 * 掩码值。受限列在结果表、单元格复制、整表复制和 CSV 导出中统一使用此值，
 * 因此掩码在数据层应用一次，展示与导出天然一致。
 */
export function maskValue(
  value: SqlValue,
  type: ColumnSchema['type'],
  masked: boolean,
): SqlValue {
  if (!masked) return value;
  if (value === null || value === undefined) return value ?? null;
  if (type === 'number' || type === 'date') return '****';
  const text = String(value);
  if (text.length === 0) return text;
  return `${text[0]}**`;
}

/** 按角色对结果行做掩码，返回可直接用于展示/复制/导出的行 */
export function maskRows(
  rows: Array<Record<string, SqlValue>>,
  columns: Array<{ name: string; source: string; type: ColumnSchema['type'] }>,
  role: Role,
): Array<Record<string, SqlValue>> {
  return rows.map((row) => {
    const maskedRow: Record<string, SqlValue> = { ...row };
    for (const column of columns) {
      if (isColumnMasked(column.source, role)) {
        maskedRow[column.name] = maskValue(row[column.name], column.type, true);
      }
    }
    return maskedRow;
  });
}
