import { CopyOutlined, DownloadOutlined, LockOutlined, TableOutlined } from '@ant-design/icons';
import { App as AntdApp, Alert, Button, Empty, Spin, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import { useEffect, useMemo, useState, type ThHTMLAttributes } from 'react';
import { isColumnMasked, maskRows, type Role } from '../auth/permissions';
import { useDataSourceStore } from '../data/dataSource';
import type { QueryResult, SqlValue } from '../types/sql';

interface ResultGridProps {
  result: QueryResult | null;
  loading: boolean;
  error: string | null;
  role: Role;
  /** 修订前进、结果正在按新修订重算 */
  recomputing: boolean;
  /** 整表复制 / CSV 导出后回调，用于把该快照定稿 */
  onExported: () => void;
}

interface ResizableTitleProps extends ThHTMLAttributes<HTMLTableCellElement> {
  width?: number;
  onResize?: (width: number) => void;
}

function ResizableTitle({ width, onResize, children, ...restProps }: ResizableTitleProps) {
  if (!width || !onResize) {
    return <th {...restProps}>{children}</th>;
  }
  return (
    <th {...restProps}>
      <div className="resizable-title">
        <span>{children}</span>
        <span
          className="column-resizer"
          onMouseDown={(event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = width;
            const onMouseMove = (moveEvent: MouseEvent) => {
              onResize(Math.max(90, startWidth + moveEvent.clientX - startX));
            };
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        />
      </div>
    </th>
  );
}

function compareValues(left: SqlValue, right: SqlValue): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'zh-CN');
}

export function ResultGrid({ result, loading, error, role, recomputing, onExported }: ResultGridProps) {
  const { message } = AntdApp.useApp();
  const [widths, setWidths] = useState<Record<string, number>>({});
  const currentRevision = useDataSourceStore((state) => state.revision);

  useEffect(() => {
    if (!result) return;
    setWidths(
      Object.fromEntries(
        result.columns.map((column) => [
          column.name,
          Math.max(130, Math.min(260, column.name.length * 14 + 60)),
        ]),
      ),
    );
  }, [result]);

  /** 按角色掩码后的行，结果表、单元格复制、整表复制和 CSV 导出共用这一份 */
  const displayRows = useMemo(
    () => (result ? maskRows(result.rows, result.columns, role) : []),
    [result, role],
  );

  const maskedNames = useMemo(() => {
    if (!result) return new Set<string>();
    return new Set(
      result.columns.filter((column) => isColumnMasked(column.source, role)).map((column) => column.name),
    );
  }, [result, role]);

  const copyValue = async (value: SqlValue) => {
    await navigator.clipboard.writeText(value === null ? 'NULL' : String(value));
    void message.success('单元格内容已复制');
  };

  const dataSource = useMemo(
    () =>
      displayRows.map((row, index) => ({
        ...row,
        __rowKey: index,
      })),
    [displayRows],
  );

  const resultWidth = useMemo(
    () =>
      result?.columns.reduce(
        (sum, column) => sum + (widths[column.name] ?? 160),
        0,
      ) ?? 0,
    [result, widths],
  );

  const columns = useMemo<ColumnsType<Record<string, SqlValue | number>>>(() => {
    if (!result) return [];
    return result.columns.map((column) => {
      const masked = maskedNames.has(column.name);
      return {
        title: (
          <span className={masked ? 'masked-column-title' : undefined}>
            {column.name}
            {masked && (
              <Tooltip title="该列对当前角色已掩码，不参与排序和合计">
                <LockOutlined className="masked-column-lock" />
              </Tooltip>
            )}
          </span>
        ),
        dataIndex: column.name,
        key: column.name,
        width: widths[column.name] ?? 160,
        ellipsis: true,
        // 掩码列不参与排序
        sorter: masked
          ? undefined
          : (a, b) => compareValues(a[column.name] as SqlValue, b[column.name] as SqlValue),
        render: (value: SqlValue) => (
          <span
            className={value === null ? 'null-value' : 'result-cell'}
            title="右键复制单元格"
            onContextMenu={(event) => {
              event.preventDefault();
              void copyValue(value);
            }}
          >
            {value === null ? 'NULL' : String(value)}
          </span>
        ),
        onHeaderCell: () => ({
          width: widths[column.name] ?? 160,
          onResize: (width: number) =>
            setWidths((current) => ({ ...current, [column.name]: width })),
        }),
      };
    });
  }, [result, widths, maskedNames]);

  /** 合计：仅对未掩码的数值列求和，掩码列不参与 */
  const totals = useMemo(() => {
    if (!result) return {};
    const acc: Record<string, number> = {};
    for (const column of result.columns) {
      if (column.type !== 'number' || maskedNames.has(column.name)) continue;
      let sum = 0;
      for (const row of displayRows) {
        const value = row[column.name];
        const numeric = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(numeric)) sum += numeric;
      }
      acc[column.name] = Math.round(sum * 100) / 100;
    }
    return acc;
  }, [result, displayRows, maskedNames]);

  const markExported = () => {
    if (result && !result.exported) onExported();
  };

  const copyAll = () => {
    if (!result) return;
    markExported();
    void navigator.clipboard
      .writeText(
        [
          result.columns.map((column) => column.name).join('\t'),
          ...displayRows.map((row) =>
            result.columns.map((column) => row[column.name] ?? '').join('\t'),
          ),
        ].join('\n'),
      )
      .then(() => message.success('结果已复制为制表符文本'));
  };

  const exportCsv = () => {
    if (!result) return;
    markExported();
    const header = result.columns.map((column) => column.name).join(',');
    const rows = displayRows.map((row) =>
      result.columns
        .map((column) => `"${String(row[column.name] ?? '').replaceAll('"', '""')}"`)
        .join(','),
    );
    const blob = new Blob([`﻿${[header, ...rows].join('\n')}`], {
      type: 'text/csv;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `query-result-rev${result.revision}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    void message.success(`已按修订 #${result.revision} 导出 CSV`);
  };

  const tableProps: TableProps<Record<string, SqlValue | number>> = {
    virtual: true,
    size: 'small',
    bordered: true,
    rowKey: '__rowKey',
    scroll: { x: Math.max(640, resultWidth), y: 330 },
    components: {
      header: {
        cell: ResizableTitle,
      },
    },
    pagination: {
      defaultPageSize: 100,
      pageSizeOptions: [50, 100, 200, 500],
      showSizeChanger: true,
      showQuickJumper: true,
      showTotal: (total) => `共 ${total} 行`,
      size: 'small',
    },
    summary: () => (
      <Table.Summary fixed>
        <Table.Summary.Row>
          <Table.Summary.Cell index={0}>
            <span className="totals-label">合计</span>
          </Table.Summary.Cell>
          {result?.columns.map((column, index) => {
            const masked = maskedNames.has(column.name);
            const isNumber = column.type === 'number';
            let content: React.ReactNode = '—';
            if (!masked && isNumber) {
              const value = totals[column.name];
              content =
                value === undefined ? '—' : (
                  <span className="totals-value">{value.toLocaleString('zh-CN')}</span>
                );
            }
            return (
              <Table.Summary.Cell key={column.name} index={index + 1}>
                {content}
              </Table.Summary.Cell>
            );
          })}
        </Table.Summary.Row>
      </Table.Summary>
    ),
  };

  const staleExported = result?.exported && result.revision < currentRevision;

  return (
    <section className="result-pane">
      <div className="result-heading">
        <div className="result-heading__title">
          <TableOutlined />
          <strong>查询结果</strong>
          {result && (
            <>
              <Tag color="blue">修订 #{result.revision}</Tag>
              {result.exported && <Tag color="gold">已导出快照</Tag>}
              <Tag color={result.truncated ? 'orange' : 'green'}>
                {result.rowCount.toLocaleString('zh-CN')} 行
              </Tag>
              <span>匹配 {result.totalMatched.toLocaleString('zh-CN')} 行</span>
              <span>· {result.elapsedMs} ms</span>
            </>
          )}
        </div>
        <div>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            disabled={!result}
            onClick={copyAll}
          >
            复制
          </Button>
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            disabled={!result}
            onClick={exportCsv}
          >
            CSV
          </Button>
        </div>
      </div>
      <div className="result-body">
        {recomputing && (
          <Alert
            className="recompute-banner"
            type="info"
            showIcon
            message="数据已更新，正在按新修订重算结果…"
          />
        )}
        {staleExported && !recomputing && (
          <Alert
            className="recompute-banner"
            type="warning"
            showIcon
            message={`该结果为已导出快照（修订 #${result?.revision}），数据源已更新至修订 #${currentRevision}`}
          />
        )}
        {loading && !result ? (
          <div className="result-state">
            <Spin size="large" />
            <span>模拟数据源正在执行查询…</span>
          </div>
        ) : error ? (
          <div className="result-error">
            <strong>查询未能执行</strong>
            <span>{error}</span>
            <small>错误位置已在编辑器中高亮，可按 Esc 关闭提示后修改 SQL。</small>
          </div>
        ) : result ? (
          <Table<Record<string, SqlValue | number>>
            {...tableProps}
            columns={columns}
            dataSource={dataSource}
          />
        ) : (
          <Empty
            className="result-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="执行查询后，结果将在这里显示"
          />
        )}
      </div>
    </section>
  );
}
