# 需求全流程管理系统 (ai-demand)

AI 驱动的需求接待、分析、任务管理与复盘平台。  
通过 AI 全流程参与 + 双轨审批机制，支撑「超级个体」模式的端到端需求交付。

## 技术栈


| 层级    | 选型                      |
| ----- | ----------------------- |
| 框架    | Vue 3 (Composition API) |
| 构建    | Vite                    |
| 语言    | TypeScript              |
| 样式    | Tailwind CSS 4          |
| UI 基础 | Headless UI (Vue)       |
| 路由    | Vue Router              |
| 状态管理  | Pinia                   |
| 图标    | Heroicons               |
| 测试    | Vitest + Vue Test Utils |
| 代码质量  | ESLint + Prettier       |


## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 运行测试
npm test

# 代码检查
npm run lint

# 格式化
npm run format
```

## 项目结构

```
src/
├── api/              # API 请求层
├── assets/           # 全局样式 & Design Tokens
├── components/
│   ├── layout/       # 布局组件 (Sidebar, Header, Layout)
│   ├── ui/           # 基础 UI 组件 (Badge, Progress...)
│   └── business/     # 业务组件 (预留)
├── composables/      # Vue Composables
├── router/           # 路由配置
├── stores/           # Pinia 状态管理
├── types/            # TypeScript 类型定义
├── utils/            # 工具函数
└── views/
    ├── admin/        # 管理后台 (业务板块/账号/角色)
    ├── requirement/  # 需求管理 (列表/对话/详情)
    └── task/         # 任务管理 (看板/详情)
```

## BMAD 工作流

本项目使用 [BMAD Method](https://github.com/bmadcode/BMAD-METHOD) 进行产品规划与架构设计。

规划产出物位于 `_bmad-output/planning-artifacts/`：

- 产品简报 (Product Brief)
- 产品需求文档 (PRD)
- UX 设计规范
- 架构决策文档

