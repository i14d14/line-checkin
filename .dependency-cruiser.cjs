/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止任何模組間循環依賴 (Acyclic Dependencies Principle, ADP)',
      from: {},
      to: { circular: true }
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: '禁止無法解析的匯入路徑',
      from: {},
      to: { couldNotResolve: true }
    },
    {
      name: 'ui-not-to-db',
      severity: 'error',
      comment: '架構分層防護：UI/前端渲染層禁止直接跳過 Service/業務層存取底層 DB/Repo',
      from: { path: '^src/(views|liff-html|local-admin-html)' },
      to: { path: '^src/(repositories|db)' }
    },
    {
      name: 'repo-not-to-service-or-route',
      severity: 'error',
      comment: '嚴格單向呼叫鏈：Repository 資料存取層嚴禁反向依賴 Service 業務層或 Route 路由層',
      from: { path: '^src/repositories' },
      to: { path: '^src/(services|routes)' }
    },
    {
      name: 'service-not-to-route',
      severity: 'error',
      comment: '嚴格單向呼叫鏈：Service 領域業務層嚴禁反向依賴 Route 路由控制器層',
      from: { path: '^src/services' },
      to: { path: '^src/routes' }
    },
    {
      name: 'utils-must-be-leaf',
      severity: 'error',
      comment: '嚴格單向呼叫鏈：Utils 工具層為純底層葉節點，嚴禁向上依賴任何業務模組',
      from: { path: '^src/utils' },
      to: { path: '^src/(repositories|services|routes|views)' }
    },
    {
      name: 'views-not-to-service',
      severity: 'error',
      comment: '嚴格單向呼叫鏈：Views 表現層嚴禁反向依賴 Service 業務邏輯層',
      from: { path: '^src/views' },
      to: { path: '^src/services' }
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: '偵測未被引用的孤島模組 (死代碼)',
      from: { orphan: true },
      to: {}
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: './tsconfig.json'
    },
    metrics: true
  }
};
