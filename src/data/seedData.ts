import type { ColumnSchema, DataTable, DatabaseSchema, SqlValue } from '../types/sql';

const CUSTOMER_PREFIXES = ['远海', '星图', '柏川', '新域', '启明', '屹辰', '和光', '云舟'];
const CUSTOMER_SUFFIXES = ['科技有限公司', '智能制造有限公司', '供应链有限公司', '数据服务有限公司'];
const REGIONS = ['华东', '华南', '华北', '西南', '西北', '东北'];
const STATUSES = ['待审核', '进行中', '已发货', '已完成', '异常'];
const PRODUCTS = ['企业云主机', '边缘计算节点', '数据治理平台', '智能客服', '可观测套件', '灾备服务'];
const OWNERS = ['陈嘉', '林月', '周砺', '许宁', '韩舟', '顾清', '沈河', '陆遥'];

export const orderColumns: ColumnSchema[] = [
  { name: 'order_no', type: 'string', description: '订单业务编号' },
  { name: 'customer_name', type: 'string', description: '客户名称（敏感）' },
  { name: 'region', type: 'string', description: '销售区域' },
  { name: 'product', type: 'string', description: '产品线' },
  { name: 'owner', type: 'string', description: '销售负责人（敏感）' },
  { name: 'amount', type: 'number', description: '含税合同金额（敏感）' },
  { name: 'quantity', type: 'number', description: '订购数量' },
  { name: 'status', type: 'string', description: '订单状态' },
  { name: 'created_at', type: 'date', description: '创建时间' },
];

const customerColumns: ColumnSchema[] = [
  { name: 'customer_id', type: 'string' },
  { name: 'customer_name', type: 'string' },
  { name: 'region', type: 'string' },
  { name: 'level', type: 'string' },
  { name: 'credit_limit', type: 'number' },
  { name: 'owner', type: 'string' },
  { name: 'active', type: 'string' },
];

const productColumns: ColumnSchema[] = [
  { name: 'product_code', type: 'string' },
  { name: 'product_name', type: 'string' },
  { name: 'category', type: 'string' },
  { name: 'list_price', type: 'number' },
  { name: 'stock', type: 'number' },
  { name: 'online', type: 'string' },
];

const employeeColumns: ColumnSchema[] = [
  { name: 'employee_id', type: 'string' },
  { name: 'employee_name', type: 'string' },
  { name: 'department', type: 'string' },
  { name: 'region', type: 'string' },
  { name: 'title', type: 'string' },
  { name: 'joined_at', type: 'date' },
  { name: 'performance', type: 'number' },
];

/** 按全局序号生成订单行，保证补录批次的单号与取值不重复 */
export function generateOrderRow(index: number): Record<string, SqlValue> {
  return {
    order_no: `SO-${202600000 + index}`,
    customer_name: `${CUSTOMER_PREFIXES[index % CUSTOMER_PREFIXES.length]}${CUSTOMER_SUFFIXES[(index * 3) % CUSTOMER_SUFFIXES.length]}`,
    region: REGIONS[(index * 5) % REGIONS.length],
    product: PRODUCTS[(index * 7) % PRODUCTS.length],
    owner: OWNERS[(index * 11) % OWNERS.length],
    amount: Math.round((1200 + ((index * 7919) % 930000) / 3) * 100) / 100,
    quantity: 1 + ((index * 17) % 320),
    status: STATUSES[(index * 13) % STATUSES.length],
    created_at: `2026-${String((index % 12) + 1).padStart(2, '0')}-${String((index * 3) % 27 + 1).padStart(2, '0')} ${String(index % 24).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00`,
  };
}

function generateCustomerRow(index: number): Record<string, SqlValue> {
  return {
    customer_id: `CUS-${String(index + 1).padStart(6, '0')}`,
    customer_name: `${CUSTOMER_PREFIXES[index % CUSTOMER_PREFIXES.length]}${CUSTOMER_SUFFIXES[(index * 3) % CUSTOMER_SUFFIXES.length]}`,
    region: REGIONS[(index * 5) % REGIONS.length],
    level: ['战略客户', '重点客户', '普通客户'][index % 3],
    credit_limit: 200000 + (index % 80) * 50000,
    owner: OWNERS[(index * 11) % OWNERS.length],
    active: index % 9 === 0 ? '否' : '是',
  };
}

function generateProductRow(index: number): Record<string, SqlValue> {
  return {
    product_code: `PRD-${String(index + 1).padStart(5, '0')}`,
    product_name: `${PRODUCTS[index % PRODUCTS.length]} ${['标准版', '专业版', '企业版'][index % 3]}`,
    category: ['云计算', '数据智能', '协同办公', '安全服务'][(index * 3) % 4],
    list_price: 1999 + (index % 120) * 800,
    stock: (index * 31) % 900,
    online: index % 11 === 0 ? '下架' : '在售',
  };
}

function generateEmployeeRow(index: number): Record<string, SqlValue> {
  return {
    employee_id: `EMP-${String(index + 1).padStart(4, '0')}`,
    employee_name: `${OWNERS[index % OWNERS.length]}${String(index).padStart(2, '0')}`,
    department: ['销售一部', '销售二部', '解决方案部', '交付中心', '客户成功部'][(index * 3) % 5],
    region: REGIONS[(index * 7) % REGIONS.length],
    title: ['客户经理', '高级客户经理', '解决方案顾问', '交付经理'][(index * 5) % 4],
    joined_at: `20${18 + (index % 8)}-${String((index % 12) + 1).padStart(2, '0')}-01`,
    performance: Math.round((68 + ((index * 29) % 32) * 0.9) * 10) / 10,
  };
}

export const SEED_TABLES: Record<string, DataTable> = {
  orders: {
    columns: orderColumns,
    rows: Array.from({ length: 18000 }, (_, index) => generateOrderRow(index)),
  },
  customers: {
    columns: customerColumns,
    rows: Array.from({ length: 2600 }, (_, index) => generateCustomerRow(index)),
  },
  products: {
    columns: productColumns,
    rows: Array.from({ length: 1200 }, (_, index) => generateProductRow(index)),
  },
  employees: {
    columns: employeeColumns,
    rows: Array.from({ length: 860 }, (_, index) => generateEmployeeRow(index)),
  },
};

export const TABLE_META: Record<string, { label: string; description: string }> = {
  orders: { label: 'orders · 销售订单明细', description: '覆盖 2026 年订单、客户、产品、负责人和履约状态' },
  customers: { label: 'customers · 客户主数据', description: '客户等级、信用额度、归属区域和责任人' },
  products: { label: 'products · 产品目录', description: '产品编码、价格、库存和上下架状态' },
  employees: { label: 'employees · 组织人员', description: '销售及交付团队人员信息' },
};

/** 结构树使用的库结构（不含数据行） */
export const DATABASE: DatabaseSchema = {
  name: 'commerce_dw',
  label: 'commerce_dw · 企业经营数据仓库',
  tables: Object.entries(SEED_TABLES).map(([name, table]) => ({
    name,
    label: TABLE_META[name].label,
    description: TABLE_META[name].description,
    columns: table.columns,
    rows: [],
  })),
};

export { OWNERS, REGIONS, STATUSES };
