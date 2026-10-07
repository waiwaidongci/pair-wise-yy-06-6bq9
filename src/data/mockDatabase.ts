import type {
  QueryColumn,
  QueryResult,
  SqlValue,
  TableSchema,
} from '../types/sql';
import { getSnapshot } from './dataSource';
import { DATABASE } from './seedData';
import { SqlQueryError } from '../utils/queryErrors';

interface ParsedQuery {
  select: Array<{ source: string; alias: string }>;
  table: TableSchema;
  where?: WhereNode;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit: number;
}

type WhereNode =
  | { kind: 'condition'; field: string; operator: string; value: string }
  | { kind: 'group'; logic: 'and' | 'or'; children: WhereNode[] };

export function getSchema() {
  return {
    ...DATABASE,
    tables: DATABASE.tables.map((table) => ({ ...table, rows: [] })),
  };
}

export async function executeMockQuery(
  sql: string,
  signal?: AbortSignal,
): Promise<QueryResult> {
  const startedAt = performance.now();
  const parsed = parseSelect(sql);
  if (!parsed) {
    throw new SqlQueryError(
      'SQL_PARSE',
      '无法解析该 SQL，当前仅支持单条 SELECT 查询',
      '示例：SELECT order_no, amount FROM orders WHERE amount > 5000 LIMIT 100',
      0,
    );
  }

  // 取当前修订下的不可变快照，后续过滤/排序/投影都贴着这份快照
  const snapshot = getSnapshot(parsed.table.name);

  await waitForMockLatency(180 + Math.min(1000, snapshot.rows.length / 40), signal);

  const selectedColumns = resolveColumns(parsed);
  const filtered = parsed.where
    ? snapshot.rows.filter((row) => evaluateWhere(row, parsed.where as WhereNode))
    : [...snapshot.rows];

  if (parsed.orderBy) {
    const { field, direction } = parsed.orderBy;
    filtered.sort((left, right) => compareValues(left[field], right[field]) * (direction === 'asc' ? 1 : -1));
  }

  const rows = filtered.slice(0, parsed.limit).map((row) => {
    const projected: Record<string, SqlValue> = {};
    selectedColumns.forEach((column) => {
      projected[column.name] = row[column.source];
    });
    return projected;
  });

  return {
    columns: selectedColumns.map(({ name, source }) => {
      const schema = parsed.table.columns.find((column) => column.name === source);
      return { name, label: name, source, type: schema?.type ?? 'string' } satisfies QueryColumn;
    }),
    rows,
    rowCount: rows.length,
    totalMatched: filtered.length,
    elapsedMs: Math.max(12, Math.round(performance.now() - startedAt)),
    sql,
    truncated: filtered.length > parsed.limit,
    revision: snapshot.revision,
    exported: false,
    executedAt: Date.now(),
  };
}

function parseSelect(sql: string): ParsedQuery | null {
  const normalized = sql.trim().replace(/;+\s*$/, '');
  if (!normalized || !/^select\b/i.test(normalized)) {
    if (!normalized) {
      throw new SqlQueryError('EMPTY_SQL', '请输入 SQL 查询语句', '输入 SELECT 语句后执行。', 0);
    }
    return null;
  }

  const match = normalized.match(
    /^select\s+([\s\S]+?)\s+from\s+([a-zA-Z_][\w]*)(?:\s+where\s+([\s\S]+?))?(?:\s+order\s+by\s+([a-zA-Z_][\w]*)(?:\s+(asc|desc))?)?(?:\s+limit\s+(\d+))?$/i,
  );
  if (!match) {
    throw new SqlQueryError(
      'SQL_PARSE',
      'SELECT 语句结构不完整',
      '支持的顺序为 SELECT ... FROM ... WHERE ... ORDER BY ... LIMIT ...',
      Math.max(0, normalized.toLowerCase().indexOf('select')),
    );
  }

  const tableName = match[2];
  const table = DATABASE.tables.find((item) => item.name.toLowerCase() === tableName.toLowerCase());
  if (!table) {
    throw new SqlQueryError(
      'TABLE_NOT_FOUND',
      `数据表 ${tableName} 不存在`,
      `可用表：${DATABASE.tables.map((item) => item.name).join('、')}`,
      normalized.indexOf(tableName),
    );
  }

  const select = match[1].split(',').map((part) => {
    const value = part.trim();
    const aliasMatch = value.match(/^([\w*]+)(?:\s+as\s+([\w]+))?$/i);
    if (!aliasMatch) {
      throw new SqlQueryError('SQL_PARSE', `无法解析投影字段：${value}`, '示例：customer_name AS 客户名称', 0);
    }
    return { source: aliasMatch[1], alias: aliasMatch[2] || aliasMatch[1] };
  });

  if (!select.some((column) => column.source === '*')) {
    const invalid = select.find(
      (column) => !table.columns.some((schema) => schema.name.toLowerCase() === column.source.toLowerCase()),
    );
    if (invalid) {
      throw new SqlQueryError(
        'COLUMN_NOT_FOUND',
        `字段 ${invalid.source} 不存在于 ${table.name}`,
        `可用字段：${table.columns.map((column) => column.name).join('、')}`,
        normalized.indexOf(invalid.source),
      );
    }
  }

  const where = match[3] ? parseWhere(match[3], table) : undefined;
  const limit = Math.min(Math.max(Number(match[6] ?? 500), 1), 5000);
  return {
    select,
    table,
    where,
    orderBy: match[4]
      ? { field: match[4], direction: (match[5]?.toLowerCase() as 'asc' | 'desc') || 'asc' }
      : undefined,
    limit,
  };
}

function parseWhere(source: string, table: TableSchema): WhereNode {
  const expression = stripOuterParentheses(source.trim());
  const orParts = splitLogical(expression, 'or');
  if (orParts.length > 1) {
    return { kind: 'group', logic: 'or', children: orParts.map((part) => parseWhere(part, table)) };
  }
  const andParts = splitLogical(expression, 'and');
  if (andParts.length > 1) {
    return { kind: 'group', logic: 'and', children: andParts.map((part) => parseWhere(part, table)) };
  }

  const condition = expression.match(/^([\w]+)\s*(=|!=|<>|>=|<=|>|<|like|in)\s*(.+)$/i);
  if (!condition) {
    throw new SqlQueryError('SQL_PARSE', `无法解析筛选条件：${expression}`, '示例：amount >= 5000', 0);
  }
  const field = table.columns.find(
    (column) => column.name.toLowerCase() === condition[1].toLowerCase(),
  );
  if (!field) {
    throw new SqlQueryError(
      'COLUMN_NOT_FOUND',
      `筛选字段 ${condition[1]} 不存在于 ${table.name}`,
      `可用字段：${table.columns.map((column) => column.name).join('、')}`,
      0,
    );
  }
  return {
    kind: 'condition',
    field: field.name,
    operator: condition[2].toLowerCase(),
    value: condition[3].trim().replace(/^['"]|['"]$/g, ''),
  };
}

function stripOuterParentheses(source: string): string {
  let expression = source;
  while (expression.startsWith('(') && expression.endsWith(')')) {
    let depth = 0;
    let wrapsWholeExpression = true;
    for (let index = 0; index < expression.length; index += 1) {
      if (expression[index] === '(') depth += 1;
      if (expression[index] === ')') depth -= 1;
      if (depth === 0 && index < expression.length - 1) {
        wrapsWholeExpression = false;
        break;
      }
    }
    if (!wrapsWholeExpression) break;
    expression = expression.slice(1, -1).trim();
  }
  return expression;
}

function splitLogical(source: string, operator: 'and' | 'or'): string[] {
  const result: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const upper = source.toUpperCase();
  const needle = ` ${operator.toUpperCase()} `;
  for (let index = 0; index <= source.length - needle.length; index += 1) {
    const char = source[index];
    if ((char === '\'' || char === '"') && source[index - 1] !== '\\') {
      quote = quote === char ? '' : quote || char;
    } else if (!quote && char === '(') {
      depth += 1;
    } else if (!quote && char === ')') {
      depth -= 1;
    } else if (!quote && depth === 0 && upper.slice(index, index + needle.length) === needle) {
      result.push(source.slice(start, index).trim());
      start = index + needle.length;
      index += needle.length - 1;
    }
  }
  result.push(source.slice(start).trim());
  return result;
}

function evaluateWhere(row: Record<string, SqlValue>, node: WhereNode): boolean {
  if (node.kind === 'group') {
    return node.logic === 'and'
      ? node.children.every((child) => evaluateWhere(row, child))
      : node.children.some((child) => evaluateWhere(row, child));
  }
  const left = row[node.field];
  const right = node.value;
  switch (node.operator) {
    case '=':
      return String(left) === right;
    case '!=':
    case '<>':
      return String(left) !== right;
    case '>':
      return compareRaw(left, right) > 0;
    case '>=':
      return compareRaw(left, right) >= 0;
    case '<':
      return compareRaw(left, right) < 0;
    case '<=':
      return compareRaw(left, right) <= 0;
    case 'like':
      return String(left).toLowerCase().includes(right.toLowerCase().replaceAll('%', ''));
    case 'in':
      return right
        .replace(/^\(|\)$/g, '')
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .includes(String(left));
    default:
      return false;
  }
}

function resolveColumns(parsed: ParsedQuery): Array<{ name: string; source: string }> {
  if (parsed.select.some((column) => column.source === '*')) {
    return parsed.table.columns.map((column) => ({ name: column.name, source: column.name }));
  }
  return parsed.select.map((column) => ({
    name: column.alias,
    source: parsed.table.columns.find(
      (schema) => schema.name.toLowerCase() === column.source.toLowerCase(),
    )?.name ?? column.source,
  }));
}

function compareValues(left: SqlValue, right: SqlValue): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'zh-CN');
}

function compareRaw(left: SqlValue, right: string): number {
  if (typeof left === 'number') return left - Number(right);
  return String(left).localeCompare(right, 'zh-CN');
}

function waitForMockLatency(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      if (signal?.aborted) {
        window.clearInterval(timer);
        reject(new SqlQueryError('QUERY_ABORTED', '用户取消了长时间查询', '可以缩小时间范围或增加筛选条件。'));
      } else if (performance.now() - startedAt >= milliseconds) {
        window.clearInterval(timer);
        resolve();
      }
    }, 20);
  });
}
