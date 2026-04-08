import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
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
  const title = (to.meta.title as string) ?? '需求全流程管理系统'
  document.title = `${title} - 需求全流程管理系统`
})

export default router
