import {
  CloudServerOutlined,
  CodeOutlined,
  HistoryOutlined,
  StarOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { Layout, Select, Tag, Tooltip } from 'antd';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getTableRowCount } from './data/mockDatabase';
import { ROLES, getRoleProfile } from './data/permissions';
import { useDataSourceStore } from './stores/dataSourceStore';
import { useWorkbenchStore } from './stores/workbenchStore';
import type { RoleId } from './types/sql';

const NAV_ITEMS = [
  { path: '/workbench', label: 'SQL 工作台', icon: <CodeOutlined /> },
  { path: '/history', label: '查询历史', icon: <HistoryOutlined /> },
  { path: '/favorites', label: '收藏查询', icon: <StarOutlined /> },
];

export function App() {
  const location = useLocation();
  const current = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
  const role = useWorkbenchStore((state) => state.role);
  const setRole = useWorkbenchStore((state) => state.setRole);
  const revision = useDataSourceStore((state) => state.revision);
  const roleProfile = getRoleProfile(role);
  // 订阅修订号，批次应用后订单行数同步刷新
  const orderCount = getTableRowCount('orders');

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
            <small>前端内存数据源 · 修订 R{revision}</small>
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
            <Tag>{orderCount.toLocaleString('zh-CN')} 行订单</Tag>
            <Tag color="geekblue">修订 R{revision}</Tag>
            <Tooltip title={`${roleProfile.label}：${roleProfile.description}`}>
              <Select<RoleId>
                size="small"
                className="role-select"
                value={role}
                suffixIcon={<UserSwitchOutlined />}
                onChange={(nextRole) => setRole(nextRole)}
                options={ROLES.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
              />
            </Tooltip>
          </div>
        </Layout.Header>
        <Layout.Content className="app-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
