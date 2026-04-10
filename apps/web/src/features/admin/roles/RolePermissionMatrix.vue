<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PermissionEntry, PermissionScope } from './types'

interface ResourceDef {
  resource: string
  label: string
  actions: { key: string; label: string }[]
}

const RESOURCE_DEFS: ResourceDef[] = [
  {
    resource: 'admin.role',
    label: '角色管理',
    actions: [
      { key: 'read', label: '查看' },
      { key: 'manage', label: '管理' },
    ],
  },
  {
    resource: 'admin.account',
    label: '账号管理',
    actions: [
      { key: 'read', label: '查看' },
      { key: 'create', label: '创建' },
      { key: 'update', label: '编辑' },
      { key: 'disable', label: '禁用' },
      { key: 'import', label: '导入' },
    ],
  },
]

const props = defineProps<{
  modelValue: PermissionEntry[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PermissionEntry[]]
}>()

type ScopeType = PermissionScope['type']

const matrix = ref<Record<string, { actions: Set<string>; scopeType: ScopeType; scopeIds: string }>>(
  {},
)

function parseFromEntries(entries: PermissionEntry[]) {
  const result: Record<string, { actions: Set<string>; scopeType: ScopeType; scopeIds: string }> = {}
  for (const def of RESOURCE_DEFS) {
    const entry = entries.find((e) => e.resource === def.resource)
    result[def.resource] = {
      actions: new Set(entry?.actions ?? []),
      scopeType: entry?.scope?.type ?? 'all',
      scopeIds: entry?.scope?.ids?.join(', ') ?? '',
    }
  }
  return result
}

watch(
  () => props.modelValue,
  (newVal) => {
    matrix.value = parseFromEntries(newVal)
  },
  { immediate: true, deep: true },
)

const validationErrors = computed(() => {
  const errors: string[] = []
  for (const def of RESOURCE_DEFS) {
    const m = matrix.value[def.resource]
    if (!m) continue
    if (m.actions.size > 0 && m.scopeType !== 'all' && !m.scopeIds.trim()) {
      errors.push(`${def.label}：选择了 ${m.scopeType === 'project' ? '项目' : '业务线'} 范围但未填写 ID`)
    }
  }
  return errors
})

function toggleAction(resource: string, action: string) {
  const m = matrix.value[resource]
  if (!m) return
  if (m.actions.has(action)) {
    m.actions.delete(action)
  } else {
    m.actions.add(action)
  }
  emitUpdate()
}

function updateScopeType(resource: string, type: ScopeType) {
  const m = matrix.value[resource]
  if (!m) return
  m.scopeType = type
  if (type === 'all') {
    m.scopeIds = ''
  }
  emitUpdate()
}

function updateScopeIds(resource: string, ids: string) {
  const m = matrix.value[resource]
  if (!m) return
  m.scopeIds = ids
  emitUpdate()
}

function emitUpdate() {
  const entries: PermissionEntry[] = []
  for (const def of RESOURCE_DEFS) {
    const m = matrix.value[def.resource]
    if (!m || m.actions.size === 0) continue
    const scope: PermissionScope = { type: m.scopeType }
    if (m.scopeType !== 'all' && m.scopeIds.trim()) {
      scope.ids = m.scopeIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    entries.push({
      resource: def.resource,
      actions: Array.from(m.actions),
      scope,
    })
  }
  emit('update:modelValue', entries)
}

defineExpose({ validationErrors })
</script>

<template>
  <div class="space-y-4">
    <div
      v-for="def in RESOURCE_DEFS"
      :key="def.resource"
      class="rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <h4 class="mb-3 text-sm font-semibold text-text-primary">{{ def.label }}</h4>

      <div class="mb-3 flex flex-wrap gap-3">
        <label
          v-for="act in def.actions"
          :key="act.key"
          class="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
        >
          <input
            type="checkbox"
            :checked="matrix[def.resource]?.actions.has(act.key)"
            class="rounded border-border"
            @change="toggleAction(def.resource, act.key)"
          />
          <span class="text-text-secondary">{{ act.label }}</span>
        </label>
      </div>

      <div
        v-if="matrix[def.resource]?.actions.size"
        class="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3"
      >
        <span class="text-xs text-text-muted">权限范围：</span>
        <label class="flex items-center gap-1 text-xs">
          <input
            type="radio"
            :name="`scope-${def.resource}`"
            value="all"
            :checked="matrix[def.resource]?.scopeType === 'all'"
            @change="updateScopeType(def.resource, 'all')"
          />
          全部
        </label>
        <label class="flex items-center gap-1 text-xs">
          <input
            type="radio"
            :name="`scope-${def.resource}`"
            value="project"
            :checked="matrix[def.resource]?.scopeType === 'project'"
            @change="updateScopeType(def.resource, 'project')"
          />
          按项目
        </label>
        <label class="flex items-center gap-1 text-xs">
          <input
            type="radio"
            :name="`scope-${def.resource}`"
            value="businessLine"
            :checked="matrix[def.resource]?.scopeType === 'businessLine'"
            @change="updateScopeType(def.resource, 'businessLine')"
          />
          按业务线
        </label>

        <input
          v-if="matrix[def.resource]?.scopeType !== 'all'"
          type="text"
          :value="matrix[def.resource]?.scopeIds"
          class="ml-2 w-48 rounded border border-border bg-white px-2 py-1 text-xs"
          :placeholder="matrix[def.resource]?.scopeType === 'project' ? '项目 ID，逗号分隔' : '业务线 ID，逗号分隔'"
          @input="updateScopeIds(def.resource, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div v-if="validationErrors.length" class="rounded-lg bg-red-50 p-3">
      <p
        v-for="(err, idx) in validationErrors"
        :key="idx"
        class="text-xs text-danger"
      >
        {{ err }}
      </p>
    </div>
  </div>
</template>
