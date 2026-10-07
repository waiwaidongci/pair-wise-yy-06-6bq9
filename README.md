# Nebula SQL 查询工作台

基于 React、TypeScript、Vite、Ant Design、Monaco Editor、Zustand、TanStack Query
和 React Router 构建的浏览器 SQL 工作台。执行引擎完全运行在前端内存中，不依赖后端。

## 功能

- 数据库 / 表 / 字段结构树与模糊检索，受限列按当前角色标注
- 多标签 SQL 编辑器、语法高亮、自动补全、格式化与错误行标记
- `Ctrl/Cmd + Enter` 执行，长查询可取消
- 自研简单 `SELECT / WHERE / ORDER BY / LIMIT` 解析与过滤
- 虚拟滚动结果表、列宽调整、双击复制、CSV 导出和分页
- 查询历史、收藏语句、错误信息中文映射
- 使用 localStorage 持久化标签页、历史和收藏

## 数据修订与快照

- 数据源带修订号（R1 起），运营每应用一个补录/更正批次，修订号 +1 并记录批次日志
- 每次执行取该修订的数据快照，分页、复制、导出和合计均基于同一快照口径
- 结果区、查询历史和 CSV 文件名都标注修订号，口径可回溯
- 修订前进后，尚未导出的结果自动失效并按新修订重算；已导出的结果作为该修订的快照保留，并提示口径已前进

## 角色与列权限

- 头部可切换角色：管理员（全部列可见）、数据分析师、运营专员
- 受限列在结果表、单元格/整表复制和 CSV 导出中均为掩码值
- 掩码列不参与排序（`ORDER BY` 受限列会被拦截并提示）和合计

## 运行

```bash
export PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH"
corepack pnpm install
corepack pnpm dev
corepack pnpm build
```

支持示例：

```sql
SELECT order_no, customer_name, amount, status
FROM orders
WHERE amount > 5000 AND status = '已完成'
ORDER BY amount DESC
LIMIT 200;
```
