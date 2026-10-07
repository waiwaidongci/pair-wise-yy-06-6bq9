import {
  BookOutlined,
  CaretRightOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App as AntdApp, Button, Input, Modal, Space, Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryTabs } from '../components/QueryTabs';
import { ResultGrid } from '../components/ResultGrid';
import { SchemaTree } from '../components/SchemaTree';
import { SqlEditor } from '../components/SqlEditor';
import { executeMockQuery, getSchema } from '../data/mockDatabase';
import { getRevision, useDataSourceRevision } from '../data/dataSource';
import { useAuthStore } from '../auth/authStore';
import { useWorkbenchStore } from '../stores/workbenchStore';
import type { QueryErrorDetail, QueryResult } from '../types/sql';
import { formatSql } from '../utils/sqlFormatter';
import { ERROR_MAPPINGS, toQueryErrorDetail } from '../utils/queryErrors';

export function WorkbenchPage() {
  const { message } = AntdApp.useApp();
  const tabs = useWorkbenchStore((state) => state.tabs);
  const activeTabId = useWorkbenchStore((state) => state.activeTabId);
  const addTab = useWorkbenchStore((state) => state.addTab);
  const closeTab = useWorkbenchStore((state) => state.closeTab);
  const activateTab = useWorkbenchStore((state) => state.activateTab);
  const updateTab = useWorkbenchStore((state) => state.updateTab);
  const addHistory = useWorkbenchStore((state) => state.addHistory);
  const addFavorite = useWorkbenchStore((state) => state.addFavorite);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const schemaQuery = useQuery({ queryKey: ['database-schema'], queryFn: getSchema });
  const role = useAuthStore((state) => state.role);
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<QueryErrorDetail | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');
  const [lastExecutedSql, setLastExecutedSql] = useState('');

  const executeMutation = useMutation({
    mutationFn: ({ sql, signal }: { sql: string; signal: AbortSignal }) =>
      executeMockQuery(sql, signal),
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

  // 用 ref 读取最新值，避免修订监听闭包过期
  const resultRef = useRef<QueryResult | null>(result);
  resultRef.current = result;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  // 同步标记是否有查询在途，避免依赖 React isPending 的闭包过期
  const queryInFlightRef = useRef(false);

  const runQuery = useCallback(
    async (options?: { silent?: boolean }) => {
      const currentTab = activeTabRef.current;
      if (!currentTab || queryInFlightRef.current) return;
      const sql = currentTab.sql.trim();
      queryInFlightRef.current = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const silent = options?.silent ?? false;
      if (silent) {
        setRecomputing(true);
      } else {
        setError(null);
        setResult(null);
      }
      setLastExecutedSql(sql);
      try {
        const nextResult = await executeMutation.mutateAsync({
          sql,
          signal: controller.signal,
        });
        setResult(nextResult);
        if (!silent) {
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
          // 执行期间修订若前进，待本次结束后按新修订补算一次
          if (!nextResult.exported && getRevision() > nextResult.revision) {
            queueMicrotask(() => void runQueryRef.current?.({ silent: true }));
          }
        } else {
          void message.info(`数据已更新至修订 #${nextResult.revision}，结果已自动重算`);
        }
      } catch (queryError) {
        if (controller.signal.aborted) return;
        const detail = toQueryErrorDetail(queryError, sql);
        setError(detail);
        if (!silent) {
          addHistory({
            sql,
            executedAt: Date.now(),
            elapsedMs: 0,
            rowCount: 0,
            success: false,
            error: detail.message,
          });
        }
      } finally {
        queryInFlightRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        setRecomputing(false);
      }
    },
    [executeMutation, addHistory, message],
  );
  const runQueryRef = useRef(runQuery);
  runQueryRef.current = runQuery;

  // 修订前进后，未导出的结果失效并按新修订重算；已导出的快照保留
  const revision = useDataSourceRevision();
  const prevRevisionRef = useRef(revision);
  useEffect(() => {
    if (revision === prevRevisionRef.current) return;
    prevRevisionRef.current = revision;
    const current = resultRef.current;
    if (current && !current.exported && current.revision < revision) {
      void runQueryRef.current?.({ silent: true });
    }
  }, [revision]);

  if (!activeTab) return null;

  const execute = () => void runQuery({ silent: false });

  const cancel = () => {
    abortRef.current?.abort();
    void message.info('已发送取消请求');
  };

  const markExported = () => {
    setResult((current) => (current ? { ...current, exported: true } : current));
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
      <SchemaTree
        schema={schemaQuery.data}
        loading={schemaQuery.isLoading}
        role={role}
        onUseTable={useTable}
      />
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
                onClick={execute}
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
              onExecute={execute}
              onFormat={runFormat}
            />
          </div>
        </section>
        <ResultGrid
          result={result}
          loading={running}
          error={error?.message ?? null}
          role={role}
          recomputing={recomputing}
          onExported={markExported}
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
