import { useDataSourceStore } from './dataSource';
import { generateOrderRow, OWNERS, REGIONS, STATUSES } from './seedData';

/** 全局序号，保证补录批次的订单号与取值不与存量冲突 */
let orderSequence = 18000;

/** 运营补录一批订单 */
export function appendOrders(count: number): void {
  useDataSourceStore.getState().commitBatch(`补录 ${count} 笔订单`, 'append', (draft) => {
    const table = draft.orders;
    for (let i = 0; i < count; i += 1) {
      table.rows.push(generateOrderRow(orderSequence));
      orderSequence += 1;
    }
    return { affectedTables: ['orders'], affectedRows: count };
  });
}

/** 运营更正一批已有订单（金额、状态、负责人、区域） */
export function correctOrders(count: number): void {
  useDataSourceStore.getState().commitBatch(`更正 ${count} 笔订单数据`, 'correct', (draft) => {
    const table = draft.orders;
    const total = table.rows.length;
    const indices = new Set<number>();
    while (indices.size < Math.min(count, total)) {
      indices.add(Math.floor(Math.random() * total));
    }
    indices.forEach((index) => {
      const row = table.rows[index];
      row.amount = Math.round((1200 + Math.random() * 930000) * 100) / 100;
      row.status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
      row.owner = OWNERS[Math.floor(Math.random() * OWNERS.length)];
      row.region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
    });
    return { affectedTables: ['orders'], affectedRows: indices.size };
  });
}
