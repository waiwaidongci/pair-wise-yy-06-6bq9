import { DeploymentUnitOutlined, PlusCircleOutlined, ToolOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Tag } from 'antd';
import { useDataSourceStore } from '../stores/dataSourceStore';
import type { BatchKind } from '../types/sql';

/**
 * 运营批次面板：模拟运营按批次补录/更正订单数据。
 * 每应用一个批次，数据源修订号 +1；未导出的查询结果会失效并按新修订重算。
 */
export function BatchPanel() {
  const { message } = AntdApp.useApp();
  const revision = useDataSourceStore((state) => state.revision);
  const batches = useDataSourceStore((state) => state.batches);
  const applyBatch = useDataSourceStore((state) => state.applyBatch);

  const apply = (kind: BatchKind) => {
    const batch = applyBatch(kind);
    void message.success(`已应用${batch.label}（${batch.detail}），数据修订前进到 R${batch.revision}`);
  };

  return (
    <div className="batch-panel">
      <div className="batch-panel__heading">
        <span>
          <DeploymentUnitOutlined /> 运营批次
        </span>
        <Tag color="geekblue">修订 R{revision}</Tag>
      </div>
      <div className="batch-actions">
        <Button size="small" icon={<PlusCircleOutlined />} onClick={() => apply('backfill')}>
          模拟批次补录
        </Button>
        <Button size="small" icon={<ToolOutlined />} onClick={() => apply('correction')}>
          模拟批次更正
        </Button>
      </div>
      <div className="batch-log">
        {batches.length === 0 ? (
          <span className="batch-empty">暂无批次，当前为初始数据 R{revision}</span>
        ) : (
          batches.slice(0, 4).map((batch) => (
            <div key={batch.id} className="batch-log__item">
              <Tag color="geekblue">R{batch.revision}</Tag>
              <span className="batch-log__detail">
                {batch.label} · {batch.detail}
              </span>
              <time>{new Date(batch.appliedAt).toLocaleTimeString('zh-CN')}</time>
            </div>
          ))
        )}
      </div>
      <p className="batch-note">批次应用后修订号 +1，未导出的结果将失效并按新修订重算。</p>
    </div>
  );
}
