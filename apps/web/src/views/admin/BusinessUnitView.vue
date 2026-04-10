<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { accountsApi } from '@/features/admin/accounts/api'
import type { AdminAccount } from '@/features/admin/accounts/types'
import { businessUnitsApi, type BusinessUnit } from '@/features/admin/business-units/api'
import { ApiError } from '@/api/client'
import { useToast } from '@/shared/useToast'

type Mode = 'create' | 'edit'

const loading = ref(false)
const units = ref<BusinessUnit[]>([])
const accounts = ref<AdminAccount[]>([])
const actionError = ref('')
const { message: toastMessage, visible: toastVisible, show: showToast } = useToast()

const isDrawerOpen = ref(false)
const mode = ref<Mode>('create')
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  description: '',
  functionList: [] as string[],
  deliveryManagerId: '',
  admissionCriteria: '',
  admissionThreshold: 80,
})

const tagInput = ref('')
const confirmToggleId = ref<string | null>(null)
const confirmToggleAction = ref<'disable' | 'enable'>('disable')

const submitting = ref(false)
const drawerRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)

const title = computed(() => (mode.value === 'create' ? '新建业务板块' : '编辑业务板块'))

const enabledAccounts = computed(() => accounts.value.filter((a) => a.status === 'enabled'))

const accountById = computed(() => {
  const m = new Map<string, AdminAccount>()
  accounts.value.forEach((a) => m.set(a.id, a))
  return m
})

function managerLabel(id: string) {
  const a = accountById.value.get(id)
  return a ? `${a.name}（${a.email}）` : id
}

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
    const first = drawerRef.value?.querySelector<HTMLElement>('input, select, button')
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

async function loadData() {
  loading.value = true
  actionError.value = ''
  try {
    const [u, acc] = await Promise.all([businessUnitsApi.list(), accountsApi.list()])
    units.value = u
    accounts.value = acc
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '网络异常或服务不可用'
    actionError.value = formatGuidedError(
      '加载业务板块数据失败',
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
  form.functionList = []
  form.deliveryManagerId = enabledAccounts.value[0]?.id ?? ''
  form.admissionCriteria = ''
  form.admissionThreshold = 80
  tagInput.value = ''
  actionError.value = ''
  isDrawerOpen.value = true
}

function openEdit(unit: BusinessUnit) {
  mode.value = 'edit'
  editingId.value = unit.id
  form.name = unit.name
  form.description = unit.description
  form.functionList = [...unit.functionList]
  form.deliveryManagerId = unit.deliveryManagerId
  form.admissionCriteria = unit.admissionCriteria
  form.admissionThreshold = unit.admissionThreshold
  tagInput.value = ''
  actionError.value = ''
  isDrawerOpen.value = true
}

function addTag() {
  const t = tagInput.value.trim()
  if (!t) return
  if (!form.functionList.includes(t)) {
    form.functionList.push(t)
  }
  tagInput.value = ''
}

function removeTag(index: number) {
  form.functionList.splice(index, 1)
}

async function submitForm() {
  if (submitting.value) return
  actionError.value = ''

  if (!form.deliveryManagerId) {
    actionError.value = formatGuidedError(
      '表单校验失败',
      '未选择交付经理',
      '从下拉列表中选择一名已启用的交付经理',
    )
    return
  }

  submitting.value = true
  try {
    if (mode.value === 'create') {
      await businessUnitsApi.create({
        name: form.name,
        description: form.description,
        functionList: form.functionList,
        deliveryManagerId: form.deliveryManagerId,
        admissionCriteria: form.admissionCriteria,
        admissionThreshold: form.admissionThreshold,
      })
      showToast('业务板块创建成功')
    } else if (editingId.value) {
      await businessUnitsApi.update(editingId.value, {
        name: form.name,
        description: form.description,
        functionList: form.functionList,
        deliveryManagerId: form.deliveryManagerId,
        admissionCriteria: form.admissionCriteria,
        admissionThreshold: form.admissionThreshold,
      })
      showToast('业务板块已更新')
    }
    isDrawerOpen.value = false
    await loadData()
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '请求异常'
    actionError.value = formatGuidedError(
      mode.value === 'create' ? '创建业务板块失败' : '更新业务板块失败',
      reason,
      '核对板块名称、交付经理与阈值后重试；若名称重复请更换名称',
    )
  } finally {
    submitting.value = false
  }
}

function promptToggle(unit: BusinessUnit) {
  confirmToggleId.value = unit.id
  confirmToggleAction.value = unit.status === 'enabled' ? 'disable' : 'enable'
}

async function confirmToggle() {
  if (!confirmToggleId.value) return
  const id = confirmToggleId.value
  const action = confirmToggleAction.value
  confirmToggleId.value = null
  actionError.value = ''

  try {
    if (action === 'disable') {
      await businessUnitsApi.disable(id)
      showToast('业务板块已禁用')
    } else {
      await businessUnitsApi.enable(id)
      showToast('业务板块已启用')
    }
    await loadData()
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.message}${error.requestId ? `（requestId: ${error.requestId}）` : ''}`
        : '请求异常'
    actionError.value = formatGuidedError(
      action === 'disable' ? '禁用业务板块失败' : '启用业务板块失败',
      reason,
      '确认板块状态后重试',
    )
  }
}

onMounted(() => {
  void loadData()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">业务板块管理</h1>
        <p class="mt-1 text-sm text-text-muted">配置板块功能清单、交付经理与准入规则</p>
      </div>
      <button
        type="button"
        class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-700"
        @click="openCreate"
      >
        新建板块
      </button>
    </div>

    <p v-if="actionError && !isDrawerOpen" class="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-danger">
      {{ actionError }}
    </p>

    <div class="rounded-xl border border-border bg-white shadow-card">
      <div class="border-b border-border px-5 py-3">
        <h2 class="text-sm font-semibold text-text-primary">板块列表</h2>
      </div>
      <div class="p-4">
        <p v-if="loading" class="text-sm text-text-muted">加载中...</p>
        <p v-else-if="units.length === 0" class="flex min-h-72 items-center justify-center text-center text-sm text-text-muted">
          暂无业务板块，点击上方按钮创建
        </p>
        <table v-else class="w-full text-left text-sm">
          <thead>
            <tr class="text-xs uppercase tracking-wide text-text-muted">
              <th class="py-2">名称</th>
              <th class="py-2">描述</th>
              <th class="py-2">交付经理</th>
              <th class="py-2">功能数量</th>
              <th class="py-2">准入阈值</th>
              <th class="py-2">状态</th>
              <th class="py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="unit in units"
              :key="unit.id"
              class="border-t border-border hover:bg-slate-50/80"
            >
              <td class="py-2 font-medium text-text-primary">{{ unit.name }}</td>
              <td class="max-w-xs truncate py-2 text-text-secondary">{{ unit.description || '—' }}</td>
              <td class="py-2 text-text-secondary">{{ managerLabel(unit.deliveryManagerId) }}</td>
              <td class="py-2 text-text-muted">{{ unit.functionList.length }}</td>
              <td class="py-2 text-text-muted">{{ unit.admissionThreshold }}</td>
              <td class="py-2">
                <span :class="unit.status === 'enabled' ? 'text-success' : 'text-text-muted'">
                  {{ unit.status === 'enabled' ? '启用' : '禁用' }}
                </span>
              </td>
              <td class="py-2">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="min-h-11 rounded border border-border px-3 py-2 text-xs text-text-secondary transition hover:bg-slate-50"
                    @click="openEdit(unit)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    :class="
                      unit.status === 'enabled'
                        ? 'min-h-11 rounded border border-danger px-3 py-2 text-xs text-danger transition hover:bg-red-50'
                        : 'min-h-11 rounded border border-success px-3 py-2 text-xs text-success transition hover:bg-green-50'
                    "
                    @click="promptToggle(unit)"
                  >
                    {{ unit.status === 'enabled' ? '禁用' : '启用' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Drawer -->
    <div
      v-if="isDrawerOpen"
      class="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="business-unit-form-drawer"
      @click.self="isDrawerOpen = false"
      @keydown.escape="isDrawerOpen = false"
      @keydown="trapFocus($event, drawerRef)"
    >
      <div ref="drawerRef" class="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-modal">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold text-text-primary">{{ title }}</h3>
          <button
            type="button"
            class="min-h-11 min-w-11 text-sm text-text-muted"
            @click="isDrawerOpen = false"
          >
            关闭
          </button>
        </div>

        <form class="space-y-4" @submit.prevent="submitForm">
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">板块名称</span>
            <input
              v-model="form.name"
              required
              class="w-full min-h-11 rounded border border-border px-2 py-2"
            />
          </label>

          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">描述</span>
            <input
              v-model="form.description"
              class="w-full min-h-11 rounded border border-border px-2 py-2"
            />
          </label>

          <div class="block text-sm">
            <span class="mb-1 block text-text-secondary">功能清单</span>
            <div class="flex flex-wrap gap-2 rounded border border-border p-2">
              <span
                v-for="(tag, idx) in form.functionList"
                :key="`${tag}-${idx}`"
                class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-text-primary"
              >
                {{ tag }}
                <button
                  type="button"
                  class="min-h-8 min-w-8 rounded text-text-muted hover:text-danger"
                  :aria-label="`移除 ${tag}`"
                  @click="removeTag(idx)"
                >
                  ×
                </button>
              </span>
            </div>
            <div class="mt-2 flex gap-2">
              <input
                v-model="tagInput"
                class="min-h-11 flex-1 rounded border border-border px-2 py-2"
                placeholder="输入后按 Enter 添加"
                @keydown.enter.prevent="addTag"
              />
              <button
                type="button"
                class="min-h-11 rounded border border-border px-3 text-sm text-text-secondary hover:bg-slate-50"
                @click="addTag"
              >
                添加
              </button>
            </div>
          </div>

          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">交付经理</span>
            <select
              v-model="form.deliveryManagerId"
              required
              class="w-full min-h-11 rounded border border-border px-2 py-2"
            >
              <option disabled value="">请选择已启用的账号</option>
              <option v-for="acc in enabledAccounts" :key="acc.id" :value="acc.id">
                {{ acc.name }}（{{ acc.email }}）
              </option>
            </select>
          </label>

          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">准入标准</span>
            <textarea
              v-model="form.admissionCriteria"
              rows="6"
              class="w-full rounded border border-border px-2 py-2"
            />
          </label>

          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">匹配度阈值（0–100）</span>
            <input
              v-model.number="form.admissionThreshold"
              type="number"
              min="0"
              max="100"
              step="1"
              required
              class="w-full min-h-11 rounded border border-border px-2 py-2"
            />
          </label>

          <p
            v-if="actionError && isDrawerOpen"
            class="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-danger"
          >
            {{ actionError }}
          </p>

          <button
            class="w-full min-h-11 rounded-lg bg-primary-600 px-3 py-2 text-sm text-text-inverse hover:bg-primary-700 disabled:opacity-50"
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
      aria-label="toggle-unit-dialog"
      @click.self="confirmToggleId = null"
      @keydown.escape="confirmToggleId = null"
      @keydown="trapFocus($event, dialogRef)"
    >
      <div ref="dialogRef" class="w-full max-w-sm rounded-xl bg-white p-4">
        <h3 class="text-sm font-semibold text-text-primary">
          {{ confirmToggleAction === 'disable' ? '确认禁用该业务板块？' : '确认启用该业务板块？' }}
        </h3>
        <p class="mt-2 text-sm text-text-secondary">
          {{
            confirmToggleAction === 'disable'
              ? '禁用后需求接待将不再选用该板块。'
              : '启用后该板块可再次被需求接待识别与路由。'
          }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="min-h-11 rounded border border-border px-3 py-2 text-sm"
            @click="confirmToggleId = null"
          >
            取消
          </button>
          <button
            type="button"
            :class="
              confirmToggleAction === 'disable'
                ? 'min-h-11 rounded bg-danger px-3 py-2 text-sm text-text-inverse'
                : 'min-h-11 rounded bg-success px-3 py-2 text-sm text-text-inverse'
            "
            @click="confirmToggle"
          >
            {{ confirmToggleAction === 'disable' ? '确认禁用' : '确认启用' }}
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="toast-fade">
        <div
          v-if="toastVisible"
          role="status"
          aria-live="polite"
          class="fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
        >
          {{ toastMessage }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}
</style>
