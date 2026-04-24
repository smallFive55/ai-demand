<script setup lang="ts">
/**
 * Story 2.4：交付经理接待成功通知深链落地页。
 *
 * 架构契约（`architecture.md:104`）：
 *   `/{role}/approvals?requirementId=&step=&actionId=&source=wecom`
 * 本视图只作为"过渡落地页"：定位目标需求 + 展示 AI 识别与准入结果；
 * 独立的双轨审批视图将在 Story 3.2 / 4.1 建设完成后替换本组件。
 *
 * data-test 钩子（与 RequirementChatView 保持约定）：
 * - `delivery-manager-approvals-root`：根容器
 * - `deep-link-hint`：企微来源提示
 * - `deep-link-invalid-hint`：参数无效 / 无权限 / 加载失败的三段式提示
 * - `requirement-title` / `requirement-status` / `requirement-admission`：关键字段
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { intakeApi } from '@/features/intake/api'
import { useAuthStore } from '@/stores/auth'
import type { Requirement } from '@ai-demand/contracts'
import { STATUS_LABEL } from '@/types/requirement'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const pageLoading = ref(true)
/** 参数/权限问题的三段式提示（问题 + 原因 + 下一步） */
const invalidHint = ref('')
/** WeCom 来源提示（仅在 source=wecom 且需求成功加载后展示） */
const deepLinkHint = ref('')
const requirement = ref<Requirement | null>(null)
/** 匹配度阈值（来自 URL/深链，当前版本从加载结果推导；缺失时 UI 省略） */

function guidedError(problem: string, reason: string, nextStep: string) {
  return `${problem} ${reason} ${nextStep}`
}

function guidedInfo(context: string, detail: string, nextStep: string) {
  return `${context} ${detail} ${nextStep}`
}

function readSingleQuery(key: string): string | null {
  const raw = route.query[key]
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  return null
}

/**
 * UUID / 宽松字符白名单校验（Story 2.3 Round-3 遗留 LOW follow-up 在本故事落地）。
 * 仅允许常见 requirementId 形态：UUID 或 36 内可读字符（[0-9a-zA-Z-_]）。
 */
function isLikelyValidRequirementId(id: string): boolean {
  if (id.length === 0 || id.length > 64) return false
  return /^[0-9a-zA-Z-_]+$/.test(id)
}

const isDeliveryManager = computed(() => authStore.isDeliveryManager)
const isAuthenticated = computed(() => authStore.isAuthenticated)

const admissionSummary = computed(() => {
  const r = requirement.value
  if (!r) return null
  const a = r.admissionAssessment
  return {
    businessUnitId: a.businessUnitId,
    projectIds: a.projectIds,
    admissionScore: a.admissionScore,
    admissionRationale: a.admissionRationale,
  }
})

async function bootstrap() {
  pageLoading.value = true
  invalidHint.value = ''
  deepLinkHint.value = ''

  if (!isAuthenticated.value) {
    // 保留深链语义：登录回跳后继续落到本页
    await router.replace({ path: '/login', query: { redirect: route.fullPath } })
    pageLoading.value = false
    return
  }

  if (!isDeliveryManager.value) {
    invalidHint.value = guidedError(
      '问题：无法打开该通知链接。',
      '原因：当前账号不是交付经理角色，无权进入审查通道。',
      '下一步：请使用交付经理账号登录；若需要权限调整请联系管理员。',
    )
    pageLoading.value = false
    return
  }

  const rid = readSingleQuery('requirementId')
  const step = readSingleQuery('step')
  const source = readSingleQuery('source')

  if (!rid || !isLikelyValidRequirementId(rid)) {
    invalidHint.value = guidedError(
      '问题：通知链接参数不完整。',
      '原因：缺少有效的 requirementId 或格式不合法，可能链接被截断。',
      '下一步：请回到企业微信通知重新点击，或从"我的通知"进入。',
    )
    pageLoading.value = false
    return
  }
  if (step && step !== 'review') {
    invalidHint.value = guidedError(
      '问题：通知步骤与当前落地页不匹配。',
      `原因：链接声明的 step=${step}，但本页仅处理 step=review 的接待成功通知。`,
      '下一步：请从企业微信通知重新进入；若为旧链接可忽略。',
    )
    pageLoading.value = false
    return
  }

  try {
    requirement.value = await intakeApi.getRequirement(rid)
    if (source === 'wecom') {
      deepLinkHint.value = guidedInfo(
        '你正在从企业微信通知进入本页。',
        '该需求已被接待（状态「已接待」），等待你进入审查。',
        '审查目标需求的识别与准入结果，必要时可进入详情进一步处理。',
      )
    }
  } catch (e) {
    if (e instanceof ApiError) {
      invalidHint.value = guidedError(
        '问题：无法加载该需求。',
        `原因：${e.message}`,
        '下一步：请稍后重试，或从"我的通知 / 需求列表"重新进入。',
      )
    } else {
      invalidHint.value = guidedError(
        '问题：无法加载该需求。',
        '原因：网络或服务异常，或该需求不存在 / 无访问权限。',
        '下一步：请稍后重试，或从"我的通知 / 需求列表"重新进入。',
      )
    }
  } finally {
    pageLoading.value = false
  }
}

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <div
    data-test="delivery-manager-approvals-root"
    class="mx-auto max-w-5xl space-y-5"
  >
    <header>
      <h1 class="text-2xl font-bold text-text-primary">需求审查</h1>
      <p class="mt-1 text-sm text-text-muted">交付经理通过企业微信通知深链进入的审查落地页</p>
    </header>

    <p
      v-if="pageLoading"
      class="rounded-xl border border-border bg-white px-6 py-8 text-center text-sm text-text-muted shadow-card"
    >
      正在加载需求…
    </p>

    <p
      v-else-if="invalidHint"
      data-test="deep-link-invalid-hint"
      class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
      role="alert"
    >
      {{ invalidHint }}
    </p>

    <template v-else-if="requirement">
      <p
        v-if="deepLinkHint"
        data-test="deep-link-hint"
        class="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900"
        role="status"
      >
        {{ deepLinkHint }}
      </p>

      <section class="rounded-xl border border-border bg-white shadow-card">
        <header class="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <p data-test="requirement-title" class="text-sm font-semibold text-text-primary">
              {{ requirement.title }}
            </p>
            <p class="mt-1 text-xs text-text-muted">需求编号：{{ requirement.id }}</p>
            <p class="mt-1 text-xs text-text-muted">提交者：{{ requirement.submitterId }}</p>
          </div>
          <span
            data-test="requirement-status"
            class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
          >
            {{ STATUS_LABEL[requirement.status] ?? requirement.status }}
          </span>
        </header>

        <div class="space-y-4 px-6 py-5">
          <div
            v-if="admissionSummary"
            data-test="requirement-admission"
            class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-text-primary"
          >
            <p class="font-medium text-text-primary">识别与准入</p>
            <ul class="mt-2 list-inside list-disc space-y-1 text-text-secondary">
              <li v-if="admissionSummary.businessUnitId">
                拟归属板块：{{ admissionSummary.businessUnitId }}
              </li>
              <li v-if="admissionSummary.projectIds?.length">
                关联项目 ID：{{ admissionSummary.projectIds.join('、') }}
              </li>
              <li v-if="admissionSummary.admissionScore != null">
                匹配度：{{ admissionSummary.admissionScore }}
              </li>
              <li v-if="admissionSummary.admissionRationale">
                说明：{{ admissionSummary.admissionRationale }}
              </li>
            </ul>
          </div>

          <div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-text-muted">
            过渡落地页：独立的双轨审批操作将在后续 Story（3.2 / 4.1）接入；当前可通过「需求列表」查看完整字段快照与历史消息。
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
