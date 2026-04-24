import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/ForgotPasswordView.vue'),
    meta: { title: '忘记密码', public: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/views/ResetPasswordView.vue'),
    meta: { title: '重置密码', public: true },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '工作台', icon: 'HomeIcon' },
  },

  // ── 需求接待 ──
  {
    path: '/requirement',
    name: 'requirement',
    redirect: '/requirement/list',
    meta: { title: '需求管理', icon: 'ChatBubbleLeftRightIcon' },
    children: [
      {
        path: 'list',
        name: 'requirement-list',
        component: () => import('@/views/requirement/RequirementListView.vue'),
        meta: { title: '需求列表' },
      },
      {
        path: 'new',
        name: 'requirement-new',
        component: () => import('@/views/requirement/RequirementChatView.vue'),
        meta: { title: '提交需求' },
      },
      {
        path: ':id',
        name: 'requirement-detail',
        component: () => import('@/views/requirement/RequirementDetailView.vue'),
        meta: { title: '需求详情' },
        props: true,
      },
    ],
  },

  // ── 通知深链契约（架构 `architecture.md:104`）──
  // `/{role}/approvals?requirementId=&step=&actionId=&source=wecom` 是通知服务的统一深链形态。
  // Story 2.3：业务方放弃事件深链（面向提交者，informational），复用 RequirementChatView；
  // Story 2.4：交付经理接待成功事件深链（面向接待经理，进入审查），使用独立 Landing 组件。
  // 独立的双轨审批视图将在 Story 3.2 / 4.1 落地后替换 DeliveryManagerApprovalsLanding。
  {
    path: '/business/approvals',
    name: 'business-approvals',
    component: () => import('@/views/requirement/RequirementChatView.vue'),
    meta: { title: '我的通知' },
  },
  {
    path: '/delivery-manager/approvals',
    name: 'delivery-manager-approvals',
    component: () => import('@/views/requirement/DeliveryManagerApprovalsLanding.vue'),
    meta: { title: '需求审查', requiresDeliveryManager: true },
  },

  // ── 任务管理 ──
  {
    path: '/task',
    name: 'task',
    redirect: '/task/board',
    meta: { title: '任务管理', icon: 'ClipboardDocumentListIcon' },
    children: [
      {
        path: 'board',
        name: 'task-board',
        component: () => import('@/views/task/TaskBoardView.vue'),
        meta: { title: '任务看板' },
      },
      {
        path: ':id',
        name: 'task-detail',
        component: () => import('@/views/task/TaskDetailView.vue'),
        meta: { title: '任务详情' },
        props: true,
      },
    ],
  },

  // ── 管理后台 ──
  {
    path: '/admin',
    name: 'admin',
    redirect: '/admin/business-unit',
    meta: { title: '系统管理', icon: 'Cog6ToothIcon', requiresAdmin: true },
    children: [
      {
        path: 'business-unit',
        name: 'admin-business-unit',
        component: () => import('@/views/admin/BusinessUnitView.vue'),
        meta: { title: '业务板块管理' },
      },
      {
        path: 'account',
        name: 'admin-account',
        component: () => import('@/views/admin/AccountView.vue'),
        meta: { title: '账号管理' },
      },
      {
        path: 'role',
        name: 'admin-role',
        component: () => import('@/views/admin/RoleView.vue'),
        meta: { title: '角色管理' },
      },
    ],
  },

  // ── 404 ──
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  authStore.ensureUserFromToken()

  if (to.meta.public) {
    const pubTitle = (to.meta.title as string) ?? '需求全流程管理系统'
    document.title = `${pubTitle} - 需求全流程管理系统`
    return true
  }

  if (to.meta.requiresAdmin && (!authStore.isAuthenticated || !authStore.canAccessAdminConsole)) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // Story 2.4：交付经理接待通知深链访问控制（角色守卫）
  // 未登录 → 登录回跳保留深链语义；已登录但非 delivery_manager → 放行但组件层渲染
  // "问题/原因/下一步"三段式提示（不白屏、不直接抢救式跳转）。
  if (to.meta.requiresDeliveryManager) {
    if (!authStore.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (!authStore.isDeliveryManager) {
      // 已登录但角色不匹配 → 放行到组件，由组件展示三段式引导提示
      // （不直接重定向，避免丢失深链语义）
    }
  }

  const title = (to.meta.title as string) ?? '需求全流程管理系统'
  document.title = `${title} - 需求全流程管理系统`
  return true
})

export default router
