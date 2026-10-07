import {
  CloudServerOutlined,
  CodeOutlined,
  HistoryOutlined,
  PlusOutlined,
  StarOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { App as AntdApp, Layout, Select, Tag, Tooltip } from 'antd';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROLE_OPTIONS, type Role } from './auth/permissions';
import { useAuthStore } from './auth/authStore';
import { appendOrders, correctOrders } from './data/batchOperations';
import { useDataSourceRevision } from './data/dataSource';

const NAV_ITEMS = [
  { path: '/workbench', label: 'SQL 工作台', icon: <CodeOutlined /> },
  { path: '/history', label: '查询历史', icon: <HistoryOutlined /> },
  { path: '/favorites', label: '收藏查询', icon: <StarOutlined /> },
];

function HeaderControls() {
  const { message } = AntdApp.useApp();
  const revision = useDataSourceRevision();
  const role = useAuthStore((state) => state.role);
  const setRole = useAuthStore((state) => state.setRole);

  return (
    <div className="header-controls">
      <Tooltip title="数据源修订号：每次补录/更正批次落库后递增，查询结果据此快照">
        <Tag color="blue" className="revision-tag">
          修订 #{revision}
        </Tag>
      </Tooltip>
      <Select
        value={role}
        onChange={(value: Role) => setRole(value)}
        options={ROLE_OPTIONS}
        className="role-select"
        variant="filled"
      />
      <Tooltip title="运营按批次补录订单，落库后修订号 +1，未导出的结果将自动重算">
        <Tag
          icon={<PlusOutlined />}
          className="batch-tag batch-tag--append"
          onClick={() => {
            appendOrders(200);
            void message.success('已补录 200 笔订单，修订号 +1');
          }}
        >
          补录订单
        </Tag>
      </Tooltip>
      <Tooltip title="运营更正已有订单数据，落库后修订号 +1，未导出的结果将自动重算">
        <Tag
          icon={<SwapOutlined />}
          className="batch-tag batch-tag--correct"
          onClick={() => {
            correctOrders(120);
            void message.success('已更正 120 笔订单，修订号 +1');
          }}
        >
          更正订单
        </Tag>
      </Tooltip>
    </div>
  );
}

export function App() {
  const location = useLocation();
  const current = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
  const revision = useDataSourceRevision();

  return (
    <Layout className="app-shell">
      <Layout.Sider width={220} className="app-sider">
        <div className="app-brand">
          <span className="app-brand__mark">
            <CloudServerOutlined />
          </span>
          <span>
            <strong>Nebula SQL</strong>
            <small>Data Workbench</small>
          </span>
        </div>
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="data-source-card">
          <span className="source-pulse" />
          <div>
            <strong>commerce_dw</strong>
            <small>前端内存数据源 · 修订 #{revision}</small>
          </div>
          <Tag color="success">在线</Tag>
        </div>
        <div className="sider-footer">
          <span>查询引擎 v1.4.2</span>
          <Tooltip title="所有数据和查询均在浏览器内运行">
            <span>Local Only</span>
          </Tooltip>
        </div>
      </Layout.Sider>
      <Layout>
        <Layout.Header className="app-header">
          <div>
            <span className="app-header__eyebrow">数据分析工具</span>
            <strong>{current?.label ?? 'Nebula SQL'}</strong>
          </div>
          <div className="header-status">
            <span className="header-status__dot" />
            <span>模拟集群运行正常</span>
            <Tag>18,000+ 行订单</Tag>
            <HeaderControls />
          </div>
        </Layout.Header>
        <Layout.Content className="app-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
