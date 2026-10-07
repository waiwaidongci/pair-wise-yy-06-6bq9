import {
  BookOutlined,
  CaretRightOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App as AntdApp, Button, Input, Modal, Space, Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BatchPanel } from '../components/BatchPanel';
import { QueryTabs } from '../components/QueryTabs';
import { ResultGrid } from '../components/ResultGrid';
import { SchemaTree } from '../components/SchemaTree';
import { SqlEditor } from '../components/SqlEditor';
import { executeMockQuery, getSchema } from '../data/mockDatabase';
import { getRoleProfile } from '../data/permissions';
import { useDataSourceStore } from '../stores/dataSourceStore';
import { useWorkbenchStore } from '../stores/workbenchStore';
import type { QueryErrorDetail, QueryResult, RoleId } from '../types/sql';
import { formatSql } from '../utils/sqlFormatter';
import { ERROR_MAPPINGS, toQueryErrorDetail } from '../utils/queryErrors';

export function WorkbenchPage() {
  const { message } = AntdApp.useApp();
  const tabs = useWorkbenchStore((state) => state.tabs);
  const activeTabId = useWorkbenchStore((state) => state.activeTabId);
  const role = useWorkbenchStore((state) => state.role);
  const addTab = useWorkbenchStore((state) => state.addTab);
  const closeTab = useWorkbenchStore((state) => state.closeTab);
  const activateTab = useWorkbenchStore((state) => state.activateTab);
  const updateTab = useWorkbenchStore((state) => state.updateTab);
  const addHistory = useWorkbenchStore((state) => state.addHistory);
  const addFavorite = useWorkbenchStore((state) => state.addFavorite);
  const revision = useDataSourceStore((state) => state.revision);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const schemaQuery = useQuery({ queryKey: ['database-schema'], queryFn: getSchema });
  const abortRef = useRef<AbortController | null>(null);
  /** 当前结果是否已通过复制/导出走带，已导出的快照在修订前进后保留不重算 */
  const exportedRef = useRef(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<QueryErrorDetail | null>(null);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');
  const [lastExecutedSql, setLastExecutedSql] = useState('');

  const executeMutation = useMutation({
    mutationFn: ({ sql, signal, execRole }: { sql: string; signal: AbortSignal; execRole: RoleId }) =>
      executeMockQuery(sql, signal, execRole),
  });

  const running = executeMutation.isPending;
  const errorTitle = error ? ERROR_MAPPINGS[error.code]?.title ?? '执行失败' : '';

  const complexity = useMemo(() => {
    const sql = activeTab?.sql ?? '';
    return {
      lines: sql.split('\n').length,
      chars: sql.length,
      hasLimit: /\blimit\b/i.test(sql),
    };
  }, [activeTab?.sql]);

  const execute = async (sqlOverride?: string) => {
    if (running || !activeTab) return;
    const sql = (sqlOverride ?? activeTab.sql).trim();
    abortRef.current = new AbortController();
    setError(null);
    setResult(null);
    setLastExecutedSql(sql);
    exportedRef.current = false;
    try {
      const nextResult = await executeMutation.mutateAsync({
        sql,
        signal: abortRef.current.signal,
        execRole: role,
      });
      setResult(nextResult);
      addHistory({
        sql,
        executedAt: Date.now(),
        elapsedMs: nextResult.elapsedMs,
        rowCount: nextResult.rowCount,
        success: true,
        revision: nextResult.revision,
      });
      if (nextResult.truncated) {
        void message.warning(`结果超过 LIMIT，已返回前 ${nextResult.rowCount} 行`);
      }
    } catch (queryError) {
      const detail = toQueryErrorDetail(queryError, sql);
      setError(detail);
      addHistory({
        sql,
        executedAt: Date.now(),
        elapsedMs: 0,
        rowCount: 0,
        success: false,
        error: detail.message,
        revision,
      });
    } finally {
      abortRef.current = null;
    }
  };

  // 修订号前进或角色切换后，尚未导出的结果失效，按新修订/新角色重算；
  // 已导出的结果作为该修订下的快照保留，仅在结果区提示口径已前进。
  useEffect(() => {
    if (!result || running || !lastExecutedSql) return;
    const revisionStale = result.revision !== revision;
    const roleStale = result.role !== role;
    if (!revisionStale && !roleStale) return;
    if (exportedRef.current) return;
    const reason = revisionStale
      ? `数据修订已前进到 R${revision}`
      : `角色已切换为「${getRoleProfile(role).label}」`;
    void message.warning(`${reason}，未导出的结果已失效，正在按新口径重算…`);
    void execute(lastExecutedSql);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, revision, role, running, lastExecutedSql]);

  if (!activeTab) return null;

  const cancel = () => {
    abortRef.current?.abort();
    void message.info('已发送取消请求');
  };

  const runFormat = () => {
    updateTab(activeTab.id, formatSql(activeTab.sql));
  };

  const useTable = (tableName: string) => {
    const table = schemaQuery.data?.tables.find((item) => item.name === tableName);
    if (!table) return;
    const sql = `SELECT *\nFROM ${table.name}\nLIMIT 500;`;
    updateTab(activeTab.id, sql, table.name);
  };

  return (
    <div className="workbench">
      <div className="side-column">
        <SchemaTree
          schema={schemaQuery.data}
          loading={schemaQuery.isLoading}
          onUseTable={useTable}
        />
        <BatchPanel />
      </div>
      <main className="query-main">
        <section className="editor-panel">
          <QueryTabs
            tabs={tabs}
            activeTabId={activeTab.id}
            onActivate={activateTab}
            onAdd={() => addTab()}
            onClose={closeTab}
          />
          <div className="editor-toolbar">
            <Space size={6}>
              <Button
                type="primary"
                icon={<CaretRightOutlined />}
                loading={running}
                onClick={() => void execute()}
              >
                执行
              </Button>
              <Tooltip title="查询执行中可取消">
                <Button
                  danger
                  icon={<StopOutlined />}
                  disabled={!running}
                  onClick={cancel}
                >
                  取消
                </Button>
              </Tooltip>
              <Button icon={<FormatPainterOutlined />} onClick={runFormat}>
                格式化
              </Button>
              <Button
                icon={<BookOutlined />}
                onClick={() => {
                  setFavoriteName(`收藏 ${useWorkbenchStore.getState().favorites.length + 1}`);
                  setFavoriteOpen(true);
                }}
              >
                收藏
              </Button>
            </Space>
            <Space size={16} className="editor-meta">
              <span>
                <HistoryOutlined /> {complexity.lines} 行 / {complexity.chars} 字符
              </span>
              <span className={complexity.hasLimit ? 'meta-ok' : 'meta-warn'}>
                {complexity.hasLimit ? '已设置 LIMIT' : '建议设置 LIMIT'}
              </span>
              <kbd>⌘ Enter</kbd>
            </Space>
          </div>
          {error && (
            <Alert
              closable
              showIcon
              type="error"
              message={`${errorTitle} [${error.code}] 第 ${error.line} 行，第 ${error.column} 列`}
              description={`${error.message} ${error.hint}`}
              onClose={() => setError(null)}
            />
          )}
          <div className="editor-wrap">
            <SqlEditor
              key={activeTab.id}
              value={activeTab.sql}
              schema={schemaQuery.data}
              error={error}
              onChange={(sql) => updateTab(activeTab.id, sql)}
              onExecute={() => void execute()}
              onFormat={runFormat}
            />
          </div>
        </section>
        <ResultGrid
          result={result}
          loading={running}
          error={error?.message ?? null}
          currentRevision={revision}
          currentRole={role}
          onExported={() => {
            exportedRef.current = true;
          }}
        />
      </main>
      <Modal
        open={favoriteOpen}
        title="收藏当前查询"
        okText="保存收藏"
        cancelText="取消"
        onCancel={() => setFavoriteOpen(false)}
        onOk={() => {
          if (!favoriteName.trim()) {
            void message.warning('请输入收藏名称');
            return;
          }
          addFavorite(favoriteName, activeTab.sql);
          setFavoriteOpen(false);
          void message.success('查询已收藏');
        }}
      >
        <Input
          autoFocus
          value={favoriteName}
          placeholder="例如：华东区高金额订单"
          onChange={(event) => setFavoriteName(event.target.value)}
          onPressEnter={() => {
            addFavorite(favoriteName, activeTab.sql);
            setFavoriteOpen(false);
          }}
        />
      </Modal>
      {lastExecutedSql && (
        <div className="execution-footprint" aria-hidden="true">
          {lastExecutedSql.slice(0, 80)}
        </div>
      )}
    </div>
  );
}
