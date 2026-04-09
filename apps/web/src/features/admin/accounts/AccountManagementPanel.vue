<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { accountsApi, type Account } from './api'
import { ApiError } from '@/api/client'

type Mode = 'create' | 'edit'

const loading = ref(false)
const accounts = ref<Account[]>([])
const feedback = ref('')
const actionError = ref('')
const importText = ref('')
const importError = ref('')
const importResultText = ref('')

const isDrawerOpen = ref(false)
const mode = ref<Mode>('create')
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  email: '',
  roleId: 'viewer',
})

const confirmDisableId = ref<string | null>(null)

const title = computed(() => (mode.value === 'create' ? '创建账号' : '编辑账号'))

function formatGuidedError(problem: string, reason: string, next: string) {
  return `问题：${problem}\n原因：${reason}\n下一步：${next}`
}

async function loadAccounts() {
  loading.value = true
  try {
    accounts.value = await accountsApi.list()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  mode.value = 'create'
  editingId.value = null
  form.name = ''
  form.email = ''
  form.roleId = 'viewer'
  actionError.value = ''
  isDrawerOpen.value = true
}

function openEdit(account: Account) {
  mode.value = 'edit'
  editingId.value = account.id
  form.name = account.name
  form.email = account.email
  form.roleId = account.roleId
  actionError.value = ''
  isDrawerOpen.value = true
}

async function submitForm() {
  feedback.value = ''
  actionError.value = ''
  try {
    if (mode.value === 'create') {
      await accountsApi.create({
        name: form.name,
        email: form.email,
        roleId: form.roleId,
      })
      feedback.value = '账号创建成功'
    } else if (editingId.value) {
      await accountsApi.update(editingId.value, {
        name: form.name,
        roleId: form.roleId,
      })
      feedback.value = '账号更新成功'
    }
    isDrawerOpen.value = false
    await loadAccounts()
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '请求异常'
    actionError.value = formatGuidedError(
      mode.value === 'create' ? '创建账号失败' : '编辑账号失败',
      reason,
      '检查角色、邮箱与输入字段后重试',
    )
  }
}

async function confirmDisable() {
  if (!confirmDisableId.value) {
    return
  }
  const id = confirmDisableId.value
  confirmDisableId.value = null
  feedback.value = ''
  actionError.value = ''
  try {
    await accountsApi.disable(id)
    feedback.value = '账号已禁用'
    await loadAccounts()
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '请求异常'
    actionError.value = formatGuidedError(
      '禁用账号失败',
      reason,
      '确认账号状态后重试，必要时联系管理员',
    )
  }
}

function parseImportPayload(text: string): Array<Pick<Account, 'name' | 'email' | 'roleId'>> {
  const trimmed = text.trim()
  const parsed = JSON.parse(trimmed) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('导入内容必须为 JSON 数组')
  }
  return parsed.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('数组项必须是对象')
    }
    const value = item as Record<string, unknown>
    return {
      name: String(value.name ?? ''),
      email: String(value.email ?? ''),
      roleId: String(value.roleId ?? ''),
    }
  })
}

async function submitImport() {
  importError.value = ''
  importResultText.value = ''
  try {
    const items = parseImportPayload(importText.value)
    const result = await accountsApi.importBatch(items)
    await loadAccounts()

    if (result.failureCount > 0) {
      const firstError = result.errors[0]
      importError.value = formatGuidedError(
        '导入存在失败项',
        `第 ${firstError.index + 1} 行失败（${firstError.reasonCode}）`,
        '修正失败行后重新导入；成功条目已保留',
      )
    }

    importResultText.value = `导入完成：成功 ${result.successCount} 条，失败 ${result.failureCount} 条`
  } catch (error) {
    const reason = error instanceof Error ? error.message : '格式解析失败'
    importError.value = formatGuidedError(
      '导入失败',
      reason,
      '检查 JSON 格式与字段（name/email/roleId）后重试',
    )
  }
}

onMounted(() => {
  void loadAccounts()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-base font-semibold text-text-primary">账号列表</h2>
      <button
        class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-text-inverse hover:bg-primary-700"
        type="button"
        @click="openCreate"
      >
        创建账号
      </button>
    </div>

    <p v-if="feedback" class="text-sm text-success">{{ feedback }}</p>
    <p v-if="actionError" class="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-danger">
      {{ actionError }}
    </p>

    <div class="rounded-xl border border-border bg-surface-card p-4">
      <p v-if="loading" class="text-sm text-text-muted">加载中...</p>
      <p v-else-if="accounts.length === 0" class="text-sm text-text-muted">暂无账号数据</p>
      <table v-else class="w-full text-left text-sm">
        <thead>
          <tr class="text-text-muted">
            <th class="py-2">姓名</th>
            <th class="py-2">邮箱</th>
            <th class="py-2">角色</th>
            <th class="py-2">状态</th>
            <th class="py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="account in accounts" :key="account.id" class="border-t border-border">
            <td class="py-2">{{ account.name }}</td>
            <td class="py-2">{{ account.email }}</td>
            <td class="py-2">{{ account.roleId }}</td>
            <td class="py-2">{{ account.status === 'enabled' ? '启用' : '禁用' }}</td>
            <td class="py-2">
              <div class="flex items-center gap-2">
                <button
                  class="rounded border border-border px-2 py-1 text-xs text-text-secondary"
                  type="button"
                  @click="openEdit(account)"
                >
                  编辑
                </button>
                <button
                  class="rounded border border-danger px-2 py-1 text-xs text-danger"
                  type="button"
                  @click="confirmDisableId = account.id"
                >
                  禁用
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="rounded-xl border border-border bg-surface-card p-4">
      <h3 class="mb-2 text-sm font-semibold text-text-primary">批量导入</h3>
      <textarea
        v-model="importText"
        class="min-h-28 w-full rounded-lg border border-border p-2 text-sm"
        placeholder='请输入 JSON 数组，例如: [{"name":"A","email":"a@x.com","roleId":"viewer"}]'
      />
      <div class="mt-2 flex items-center gap-2">
        <button
          class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-text-inverse hover:bg-primary-700"
          type="button"
          @click="submitImport"
        >
          执行导入
        </button>
        <span v-if="importResultText" class="text-sm text-text-secondary">{{ importResultText }}</span>
      </div>
      <p
        v-if="importError"
        class="mt-2 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-danger"
      >
        {{ importError }}
      </p>
    </div>

    <div
      v-if="isDrawerOpen"
      class="fixed inset-0 z-50 flex justify-end bg-black/30"
      role="dialog"
      aria-modal="true"
      aria-label="account-form-drawer"
    >
      <div class="h-full w-full max-w-md bg-white p-5 shadow-modal">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <button type="button" class="text-sm text-text-muted" @click="isDrawerOpen = false">关闭</button>
        </div>

        <form class="space-y-3" @submit.prevent="submitForm">
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">姓名</span>
            <input v-model="form.name" required class="w-full rounded border border-border px-2 py-1.5" />
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">邮箱</span>
            <input
              v-model="form.email"
              required
              type="email"
              :disabled="mode === 'edit'"
              class="w-full rounded border border-border px-2 py-1.5 disabled:bg-slate-100"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">角色</span>
            <select v-model="form.roleId" class="w-full rounded border border-border px-2 py-1.5">
              <option value="admin">admin</option>
              <option value="manager">manager</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <button
            class="w-full rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-text-inverse hover:bg-primary-700"
            type="submit"
          >
            {{ mode === 'create' ? '创建' : '保存' }}
          </button>
        </form>
      </div>
    </div>

    <div
      v-if="confirmDisableId"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-modal="true"
      aria-label="disable-confirm-dialog"
    >
      <div class="w-full max-w-sm rounded-xl bg-white p-4">
        <h3 class="text-sm font-semibold text-text-primary">确认禁用账号？</h3>
        <p class="mt-2 text-sm text-text-secondary">禁用后账号将无法访问系统。</p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded border border-border px-3 py-1.5 text-sm"
            type="button"
            @click="confirmDisableId = null"
          >
            取消
          </button>
          <button
            class="rounded bg-danger px-3 py-1.5 text-sm text-white"
            type="button"
            @click="confirmDisable"
          >
            确认禁用
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
