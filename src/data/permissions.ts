import type { RoleId, SqlValue } from '../types/sql';

export interface RoleProfile {
  id: RoleId;
  label: string;
  description: string;
}

export const ROLES: RoleProfile[] = [
  { id: 'admin', label: '管理员', description: '可见全部列，不受掩码限制' },
  { id: 'analyst', label: '数据分析师', description: '客户名称、负责人、绩效等敏感列掩码' },
  { id: 'ops', label: '运营专员', description: '金额、信用额度、绩效等列掩码' },
];

export function getRoleProfile(role: RoleId): RoleProfile {
  return ROLES.find((item) => item.id === role) ?? ROLES[0];
}

/**
 * 每个角色在各表上被掩码的列。掩码列在结果表、复制和导出中均以掩码值呈现，
 * 且不参与排序与合计。
 */
export const ROLE_COLUMN_MASKS: Record<RoleId, Record<string, string[]>> = {
  admin: {},
  analyst: {
    orders: ['customer_name', 'owner'],
    customers: ['customer_name', 'credit_limit', 'owner'],
    employees: ['employee_name', 'performance'],
  },
  ops: {
    orders: ['amount'],
    customers: ['credit_limit'],
    employees: ['performance'],
  },
};

/** 返回某角色在某表上被掩码的列名集合（小写）。 */
export function getMaskedColumns(role: RoleId, tableName: string): Set<string> {
  const columns = ROLE_COLUMN_MASKS[role]?.[tableName] ?? [];
  return new Set(columns.map((name) => name.toLowerCase()));
}

/** 生成掩码值：字符串保留首字符，数字统一为 ***，NULL 保持不变。 */
export function maskValue(value: SqlValue): SqlValue {
  if (value === null) return null;
  if (typeof value === 'number') return '***';
  const text = String(value);
  if (text.length <= 1) return '*';
  return `${text[0]}***`;
}
