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
  // 当前 Story 2.3 的放弃事件只面向业务方提交者（informational，非审批上下文），
  // 落地到已有的 RequirementChatView；后续实现独立 BusinessApprovalsView 时替换此组件。
  {
    path: '/business/approvals',
    name: 'business-approvals',
    component: () => import('@/views/requirement/RequirementChatView.vue'),
    meta: { title: '我的通知' },
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

  const title = (to.meta.title as string) ?? '需求全流程管理系统'
  document.title = `${title} - 需求全流程管理系统`
  return true
})

export default router
