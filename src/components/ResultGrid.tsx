import { CopyOutlined, DownloadOutlined, EyeInvisibleOutlined, TableOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Empty, Spin, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import { useEffect, useMemo, useState, type ThHTMLAttributes } from 'react';
import { getRoleProfile } from '../data/permissions';
import type { QueryResult, RoleId, SqlValue } from '../types/sql';

interface ResultGridProps {
  result: QueryResult | null;
  loading: boolean;
  error: string | null;
  /** 数据源当前修订号，用于标记结果口径是否已前进 */
  currentRevision: number;
  /** 当前角色，用于标记结果的角色口径是否已变更 */
  currentRole: RoleId;
  /** 结果通过复制/导出走带后回调，已导出的快照在修订前进后保留 */
  onExported?: () => void;
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

function normalizeRow(row: Record<string, SqlValue>): Record<string, SqlValue> {
  return row;
}

function formatTotal(sum: number): string {
  const rounded = Math.round(sum * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('zh-CN')
    : rounded.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ResultGrid({ result, loading, error, currentRevision, currentRole, onExported }: ResultGridProps) {
  const { message } = AntdApp.useApp();
  const [widths, setWidths] = useState<Record<string, number>>({});

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

  const copyValue = async (value: SqlValue) => {
    await navigator.clipboard.writeText(value === null ? 'NULL' : String(value));
    void message.success('单元格内容已复制');
  };

  const dataSource = useMemo(
    () =>
      (result?.rows ?? []).map((row, index) => ({
        ...normalizeRow(row),
        __rowKey: index,
      })),
    [result],
  );
  const resultWidth = useMemo(
    () =>
      result?.columns.reduce(
        (sum, column) => sum + (widths[column.name] ?? 160),
        0,
      ) ?? 0,
    [result, widths],
  );

  // 合计只统计可见的数值列，掩码列不参与合计
  const totals = useMemo(() => {
    if (!result) return [];
    return result.columns
      .filter((column) => column.type === 'number' && !column.masked)
      .map((column) => ({
        name: column.name,
        sum: result.rows.reduce((acc, row) => acc + (Number(row[column.name]) || 0), 0),
      }));
  }, [result]);
  const maskedColumnNames = useMemo(
    () => (result?.columns ?? []).filter((column) => column.masked).map((column) => column.name),
    [result],
  );

  const columns = useMemo<ColumnsType<Record<string, SqlValue | number>>>(() => {
    if (!result) return [];
    return result.columns.map((column) => ({
      title: (
        <span className="column-title">
          {column.name}
          {column.masked && (
            <Tooltip title="当前角色受限：该列已掩码，不参与排序与合计">
              <EyeInvisibleOutlined className="masked-icon" />
            </Tooltip>
          )}
        </span>
      ),
      dataIndex: column.name,
      key: column.name,
      width: widths[column.name] ?? 160,
      ellipsis: true,
      render: (value: SqlValue) => (
        <span
          className={value === null ? 'null-value' : column.masked ? 'masked-value' : 'result-cell'}
          title={column.masked ? '受限列，复制与导出均为掩码值' : '右键复制单元格'}
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
    }));
  }, [result, widths]);

  const exportCsv = () => {
    if (!result) return;
    const header = result.columns.map((column) => column.name).join(',');
    const rows = result.rows.map((row) =>
      result.columns
        .map((column) => `"${String(row[column.name] ?? '').replaceAll('"', '""')}"`)
        .join(','),
    );
    const blob = new Blob([`\uFEFF${[header, ...rows].join('\n')}`], {
      type: 'text/csv;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `query-result-r${result.revision}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    onExported?.();
    void message.success(`已按修订 R${result.revision} 的快照导出 CSV`);
  };

  const copyAll = () => {
    if (!result) return;
    void navigator.clipboard
      .writeText(
        [
          result.columns.map((column) => column.name).join('\t'),
          ...result.rows.map((row) =>
            result.columns.map((column) => row[column.name] ?? '').join('\t'),
          ),
        ].join('\n'),
      )
      .then(() => {
        onExported?.();
        void message.success(`结果已复制为制表符文本（修订 R${result.revision} 快照）`);
      });
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
  };

  const revisionStale = result !== null && result.revision !== currentRevision;
  const roleStale = result !== null && result.role !== currentRole;

  return (
    <section className="result-pane">
      <div className="result-heading">
        <div className="result-heading__title">
          <TableOutlined />
          <strong>查询结果</strong>
          {result && (
            <>
              <Tag color={result.truncated ? 'orange' : 'green'}>
                {result.rowCount.toLocaleString('zh-CN')} 行
              </Tag>
              <span>匹配 {result.totalMatched.toLocaleString('zh-CN')} 行</span>
              <span>· {result.elapsedMs} ms</span>
              <Tooltip title="本次结果所基于的数据修订快照，分页、复制和导出均使用该口径">
                <Tag color="geekblue">修订 R{result.revision}</Tag>
              </Tooltip>
              <Tooltip title="本次结果的角色口径，决定列掩码范围">
                <Tag>{getRoleProfile(result.role).label}</Tag>
              </Tooltip>
              {revisionStale && (
                <Tag color="orange">数据已前进到 R{currentRevision}</Tag>
              )}
              {roleStale && <Tag color="orange">角色口径已变更</Tag>}
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
        {loading ? (
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
          <div className="result-content">
            <div className="result-table-wrap">
              <Table<Record<string, SqlValue | number>>
                {...tableProps}
                columns={columns}
                dataSource={dataSource}
              />
            </div>
            <div className="result-summary">
              <span className="result-summary__label">合计（当前 {result.rowCount} 行）</span>
              {totals.map((total) => (
                <span key={total.name} className="result-summary__item">
                  <strong>{total.name}</strong> {formatTotal(total.sum)}
                </span>
              ))}
              {totals.length === 0 && maskedColumnNames.length === 0 && (
                <span className="result-summary__muted">当前结果没有可合计的数值列</span>
              )}
              {maskedColumnNames.length > 0 && (
                <span className="result-summary__masked">
                  <EyeInvisibleOutlined /> 掩码列不参与排序与合计：{maskedColumnNames.join('、')}
                </span>
              )}
            </div>
          </div>
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
