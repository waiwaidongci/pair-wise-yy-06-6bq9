import { create } from 'zustand';
import { applyOpsBatch, getBatchLog, getDataRevision } from '../data/mockDatabase';
import type { BatchKind, BatchRecord } from '../types/sql';

interface DataSourceState {
  /** 当前数据修订号，运营每应用一个批次 +1 */
  revision: number;
  /** 批次日志，最新在前 */
  batches: BatchRecord[];
  /** 应用一个运营批次（补录/更正），返回批次记录 */
  applyBatch: (kind: BatchKind) => BatchRecord;
}

export const useDataSourceStore = create<DataSourceState>()((set) => ({
  revision: getDataRevision(),
  batches: getBatchLog(),
  applyBatch: (kind) => {
    const batch = applyOpsBatch(kind);
    set({ revision: getDataRevision(), batches: getBatchLog() });
    return batch;
  },
}));
