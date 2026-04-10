<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { rolesApi, type Role } from '@/features/admin/roles/api'
import type { PermissionEntry } from '@/features/admin/roles/types'
import RolePermissionMatrix from '@/features/admin/roles/RolePermissionMatrix.vue'
import { ApiError } from '@/api/client'

type Mode = 'create' | 'edit'

const loading = ref(false)
const roles = ref<Role[]>([])
const feedback = ref('')
const actionError = ref('')

const isDrawerOpen = ref(false)
const mode = ref<Mode>('create')
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  description: '',
  permissions: [] as PermissionEntry[],
})

const matrixRef = ref<InstanceType<typeof RolePermissionMatrix> | null>(null)

const confirmToggleId = ref<string | null>(null)
const confirmToggleAction = ref<'disable' | 'enable'>('disable')

const submitting = ref(false)
const drawerRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)

const title = computed(() => (mode.value === 'create' ? '创建角色' : '编辑角色'))

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return
  const focusable = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(isDrawerOpen, async (open) => {
  if (open) {
    await nextTick()
    const first = drawerRef.value?.querySelector<HTMLElement>('input, button')
    first?.focus()
  }
})

watch(confirmToggleId, async (id) => {
  if (id) {
    await nextTick()
    const cancel = dialogRef.value?.querySelector<HTMLElement>('button')
    cancel?.focus()
  }
})

function formatGuidedError(problem: string, reason: string, next: string) {
  return `问题：${problem}\n原因：${reason}\n下一步：${next}`
}

async function loadRoles() {
  loading.value = true
  actionError.value = ''
  try {
    roles.value = await rolesApi.list()
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '网络异常或服务不可用'
    actionError.value = formatGuidedError(
      '加载角色列表失败',
      reason,
      '检查网络连接后刷新页面重试',
    )
  } finally {
    loading.value = false
  }
}

function openCreate() {
  mode.value = 'create'
  editingId.value = null
  form.name = ''
  form.description = ''
  form.permissions = []
  actionError.value = ''
  isDrawerOpen.value = true
}

function openEdit(role: Role) {
  mode.value = 'edit'
  editingId.value = role.id
  form.name = role.name
  form.description = role.description
  form.permissions = JSON.parse(JSON.stringify(role.permissions))
  actionError.value = ''
  isDrawerOpen.value = true
}

async function submitForm() {
  if (submitting.value) return
  feedback.value = ''
  actionError.value = ''

  const errors = matrixRef.value?.validationErrors ?? []
  if (errors.length > 0) {
    actionError.value = formatGuidedError(
      '权限配置校验失败',
      errors.join('；'),
      '补充范围 ID 或切换为"全部"范围后重试',
    )
    return
  }

  submitting.value = true
  try {
    if (mode.value === 'create') {
      await rolesApi.create({
        name: form.name,
        description: form.description,
        permissions: form.permissions,
      })
      feedback.value = '角色创建成功'
    } else if (editingId.value) {
      await rolesApi.update(editingId.value, {
        name: form.name,
        description: form.description,
        permissions: form.permissions,
      })
      feedback.value = '角色更新成功'
    }
    isDrawerOpen.value = false
    await loadRoles()
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '请求异常'
    actionError.value = formatGuidedError(
      mode.value === 'create' ? '创建角色失败' : '编辑角色失败',
      reason,
      '检查角色名称与权限配置后重试',
    )
  } finally {
    submitting.value = false
  }
}

function promptToggle(role: Role) {
  confirmToggleId.value = role.id
  confirmToggleAction.value = role.status === 'enabled' ? 'disable' : 'enable'
}

async function confirmToggle() {
  if (!confirmToggleId.value) return
  const id = confirmToggleId.value
  const action = confirmToggleAction.value
  confirmToggleId.value = null
  feedback.value = ''
  actionError.value = ''

  try {
    if (action === 'disable') {
      await rolesApi.disable(id)
      feedback.value = '角色已禁用'
    } else {
      await rolesApi.enable(id)
      feedback.value = '角色已启用'
    }
    await loadRoles()
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '请求异常'
    actionError.value = formatGuidedError(
      action === 'disable' ? '禁用角色失败' : '启用角色失败',
      reason,
      '确认角色状态后重试',
    )
  }
}

function permissionSummary(permissions: PermissionEntry[]): string {
  if (!permissions.length) return '无权限'
  return permissions
    .map((p) => `${p.resource}(${p.actions.join('/')})`)
    .join(', ')
}

onMounted(() => {
  void loadRoles()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">角色管理</h1>
        <p class="mt-1 text-sm text-text-muted">配置权限矩阵并维护角色状态</p>
      </div>
      <button
        class="rounded-md bg-primary-600 px-3 py-2 text-sm text-text-inverse transition hover:bg-primary-700"
        type="button"
        @click="openCreate"
      >
        创建角色
      </button>
    </div>

    <p v-if="feedback" class="text-sm text-success">{{ feedback }}</p>
    <p v-if="actionError" class="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-danger">
      {{ actionError }}
    </p>

    <div class="rounded-xl border border-border bg-white p-4 shadow-card">
      <p v-if="loading" class="text-sm text-text-muted">加载中...</p>
      <p v-else-if="roles.length === 0" class="text-center text-sm text-text-muted">暂无角色数据</p>
      <table v-else class="w-full text-left text-sm">
        <thead>
          <tr class="text-xs uppercase tracking-wide text-slate-500">
            <th class="py-2">角色名称</th>
            <th class="py-2">描述</th>
            <th class="py-2">权限摘要</th>
            <th class="py-2">状态</th>
            <th class="py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in roles" :key="role.id" class="border-t border-border hover:bg-slate-50/80">
            <td class="py-2 font-medium">{{ role.name }}</td>
            <td class="py-2 text-text-secondary">{{ role.description }}</td>
            <td class="max-w-xs truncate py-2 text-xs text-text-muted">
              {{ permissionSummary(role.permissions) }}
            </td>
            <td class="py-2">
              <span
                :class="role.status === 'enabled' ? 'text-success' : 'text-text-muted'"
              >
                {{ role.status === 'enabled' ? '启用' : '禁用' }}
              </span>
            </td>
            <td class="py-2">
              <div class="flex items-center gap-2">
                <button
                  class="rounded border border-border px-2 py-1 text-xs text-text-secondary transition hover:bg-slate-50"
                  type="button"
                  @click="openEdit(role)"
                >
                  编辑
                </button>
                <button
                  :class="
                    role.status === 'enabled'
                      ? 'rounded border border-danger px-2 py-1 text-xs text-danger transition hover:bg-red-50'
                      : 'rounded border border-success px-2 py-1 text-xs text-success transition hover:bg-green-50'
                  "
                  type="button"
                  @click="promptToggle(role)"
                >
                  {{ role.status === 'enabled' ? '禁用' : '启用' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Drawer -->
    <div
      v-if="isDrawerOpen"
      class="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="role-form-drawer"
      @click.self="isDrawerOpen = false"
      @keydown.escape="isDrawerOpen = false"
      @keydown="trapFocus($event, drawerRef)"
    >
      <div ref="drawerRef" class="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-modal">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <button type="button" class="text-sm text-text-muted" @click="isDrawerOpen = false">关闭</button>
        </div>

        <form class="space-y-4" @submit.prevent="submitForm">
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">角色名称</span>
            <input
              v-model="form.name"
              required
              class="w-full rounded border border-border px-2 py-1.5"
            />
          </label>

          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">描述</span>
            <input
              v-model="form.description"
              class="w-full rounded border border-border px-2 py-1.5"
            />
          </label>

          <div>
            <h4 class="mb-2 text-sm font-medium text-text-primary">权限矩阵</h4>
            <RolePermissionMatrix
              ref="matrixRef"
              v-model="form.permissions"
            />
          </div>

          <p
            v-if="actionError && isDrawerOpen"
            class="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-danger"
          >
            {{ actionError }}
          </p>

          <button
            class="w-full rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-text-inverse hover:bg-primary-700 disabled:opacity-50"
            type="submit"
            :disabled="submitting"
          >
            {{ submitting ? '提交中...' : mode === 'create' ? '创建' : '保存' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Toggle Confirm Dialog -->
    <div
      v-if="confirmToggleId"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="toggle-confirm-dialog"
      @click.self="confirmToggleId = null"
      @keydown.escape="confirmToggleId = null"
      @keydown="trapFocus($event, dialogRef)"
    >
      <div ref="dialogRef" class="w-full max-w-sm rounded-xl bg-white p-4">
        <h3 class="text-sm font-semibold text-text-primary">
          {{ confirmToggleAction === 'disable' ? '确认禁用角色？' : '确认启用角色？' }}
        </h3>
        <p class="mt-2 text-sm text-text-secondary">
          {{ confirmToggleAction === 'disable' ? '禁用后该角色下的账号权限将失效。' : '启用后该角色下的账号权限将恢复。' }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded border border-border px-3 py-1.5 text-sm"
            type="button"
            @click="confirmToggleId = null"
          >
            取消
          </button>
          <button
            :class="
              confirmToggleAction === 'disable'
                ? 'rounded bg-danger px-3 py-1.5 text-sm text-white'
                : 'rounded bg-success px-3 py-1.5 text-sm text-white'
            "
            type="button"
            @click="confirmToggle"
          >
            {{ confirmToggleAction === 'disable' ? '确认禁用' : '确认启用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
