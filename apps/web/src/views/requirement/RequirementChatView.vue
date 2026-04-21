<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PaperAirplaneIcon } from '@heroicons/vue/24/solid'
import { ApiError } from '@/api/client'
import { intakeApi } from '@/features/intake/api'
import { useAuthStore } from '@/stores/auth'
import { useRequirementStore } from '@/stores/requirement'
import type { EnabledBusinessUnitSummary, RequirementMessage } from '@ai-demand/contracts'
import { STATUS_LABEL } from '@/types/requirement'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const requirementStore = useRequirementStore()

const STORAGE_KEY = 'intake_requirement_draft_id'

const inputText = ref('')
const messages = ref<RequirementMessage[]>([])
const requirementId = ref<string | null>(null)
const pageLoading = ref(true)
const sending = ref(false)
const pageError = ref('')
const sendError = ref('')
const intakeError = ref('')
const savingIntake = ref(false)
const enabledUnits = ref<EnabledBusinessUnitSummary[]>([])
const selectedBusinessUnitId = ref('')

const abandonConfirmOpen = ref(false)
const abandonReason = ref('')
const abandoning = ref(false)
const abandonError = ref('')
const deepLinkHint = ref('')

function formatGuidedError(problem: string, reason: string, nextStep: string) {
  return `${problem} ${reason} ${nextStep}`
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderMarkdown(raw: string): string {
  const src = escapeHtml(raw ?? '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')

  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
    if (inOl) {
      out.push('</ol>')
      inOl = false
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      closeLists()
      out.push('<br />')
      continue
    }

    const ul = trimmed.match(/^[-*]\s+(.+)$/)
    if (ul) {
      if (!inUl) {
        if (inOl) {
          out.push('</ol>')
          inOl = false
        }
        out.push('<ul>')
        inUl = true
      }
      out.push(`<li>${ul[1]}</li>`)
      continue
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/)
    if (ol) {
      if (!inOl) {
        if (inUl) {
          out.push('</ul>')
          inUl = false
        }
        out.push('<ol>')
        inOl = true
      }
      out.push(`<li>${ol[1]}</li>`)
      continue
    }

    closeLists()
    if (trimmed.startsWith('### ')) {
      out.push(`<h3>${trimmed.slice(4)}</h3>`)
    } else if (trimmed.startsWith('## ')) {
      out.push(`<h2>${trimmed.slice(3)}</h2>`)
    } else if (trimmed.startsWith('# ')) {
      out.push(`<h1>${trimmed.slice(2)}</h1>`)
    } else {
      out.push(`<p>${trimmed}</p>`)
    }
  }

  closeLists()
  return out.join('')
}

const currentStatus = computed(() => requirementStore.currentRequirement?.status)
const isReceived = computed(() => currentStatus.value === 'received')
const isCollecting = computed(() => currentStatus.value === 'collecting')
const isAbandoned = computed(() => currentStatus.value === 'abandoned')
const canAbandon = computed(
  () => authStore.isBusiness && !!requirementId.value && isCollecting.value && !abandoning.value,
)

const canSend = computed(
  () =>
    inputText.value.trim().length > 0 &&
    !sending.value &&
    !!requirementId.value &&
    !pageLoading.value &&
    isCollecting.value &&
    !abandoning.value,
)

const admission = computed(() => requirementStore.currentRequirement?.admissionAssessment)

/** 与后端读权限一致：业务方 / 管理员 / 交付经理可看到识别与准入（板块修正仅业务方） */
const canViewIntakeAdmission = computed(
  () => authStore.isBusiness || authStore.isAdmin || authStore.isDeliveryManager,
)

const unitNameById = computed(() => {
  const m = new Map<string, string>()
  for (const u of enabledUnits.value) {
    m.set(u.id, u.name)
  }
  return m
})

watch(
  () => requirementStore.currentRequirement?.admissionAssessment?.businessUnitId,
  (id) => {
    if (id) selectedBusinessUnitId.value = id
  },
  { immediate: true },
)

async function loadEnabledUnits() {
  if (!canViewIntakeAdmission.value) return
  try {
    enabledUnits.value = await intakeApi.listEnabledBusinessUnits()
  } catch {
    enabledUnits.value = []
  }
}

async function createSessionAndLoad() {
  const created = await intakeApi.createRequirement()
  requirementId.value = created.id
  sessionStorage.setItem(STORAGE_KEY, created.id)
  messages.value = await intakeApi.listMessages(created.id)
  await requirementStore.fetchRequirement(created.id)
  await loadEnabledUnits()
}

function readDeepLinkRequirementId(): string | null {
  const raw = route.query.requirementId
  const id = Array.isArray(raw) ? raw[0] : raw
  if (typeof id === 'string' && id.trim().length > 0) return id.trim()
  return null
}

async function loadExistingRequirement(id: string): Promise<void> {
  messages.value = await intakeApi.listMessages(id)
  requirementId.value = id
  sessionStorage.setItem(STORAGE_KEY, id)
  await requirementStore.fetchRequirement(id)
  await loadEnabledUnits()
}

async function bootstrap() {
  pageLoading.value = true
  pageError.value = ''
  if (!authStore.isAuthenticated) {
    await router.replace({ path: '/login', query: { redirect: '/requirement/new' } })
    pageLoading.value = false
    return
  }
  if (!authStore.isBusiness) {
    pageError.value = formatGuidedError(
      '问题：当前账号无法使用对话接待。',
      '原因：仅业务方角色可创建需求会话。',
      '下一步：请使用业务方演示账号登录（默认 business / business123456），或联系管理员开通。',
    )
    pageLoading.value = false
    return
  }

  try {
    // 企微深链优先：?requirementId=...&step=abandon&source=wecom → 直接定位历史需求（只读回放）
    const deepLinkId = readDeepLinkRequirementId()
    if (deepLinkId) {
      try {
        await loadExistingRequirement(deepLinkId)
        const step = Array.isArray(route.query.step) ? route.query.step[0] : route.query.step
        // H4：仅当 step=abandon **且** 需求真实状态为 abandoned 时才展示"已放弃"文案，
        //     否则（状态未同步 / 链接过期 / 被篡改）使用中性提示，避免误导用户。
        if (step === 'abandon') {
          if (isAbandoned.value) {
            deepLinkHint.value =
              '问题：该需求已通过企业微信通知标记为「已放弃」。 原因：业务方在对话中确认放弃。 下一步：如需重新提交，请点击「新建会话」。'
          } else {
            deepLinkHint.value =
              '问题：无法确认放弃状态。 原因：链接声明为放弃通知，但需求当前状态并非「已放弃」，可能已被恢复或链接已过期。 下一步：请以当前状态为准，或从需求列表查看最新进展。'
          }
        }
        pageLoading.value = false
        return
      } catch (e) {
        // 深链失败回退到常规流程；不直接报错阻塞
        pageError.value =
          e instanceof ApiError
            ? e.message
            : formatGuidedError(
                '问题：无法打开深链对应的需求。',
                '原因：需求不存在或无访问权限。',
                '下一步：请回到需求列表或从「发起需求」重新创建。',
              )
        pageLoading.value = false
        return
      }
    }

    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        await loadExistingRequirement(stored)
        pageLoading.value = false
        return
      } catch {
        sessionStorage.removeItem(STORAGE_KEY)
      }
    }

    await createSessionAndLoad()
  } catch (e) {
    pageError.value =
      e instanceof ApiError
        ? e.message
        : formatGuidedError(
            '问题：无法打开接待会话。',
            '原因：网络或服务异常。',
            '下一步：请刷新页面或稍后重试。',
          )
  } finally {
    pageLoading.value = false
  }
}

async function saveIntakeCorrection() {
  if (!requirementId.value || !selectedBusinessUnitId.value || savingIntake.value) return
  intakeError.value = ''
  savingIntake.value = true
  try {
    await intakeApi.patchIntake(requirementId.value, {
      businessUnitId: selectedBusinessUnitId.value,
    })
    await requirementStore.fetchRequirement(requirementId.value)
  } catch (e) {
    intakeError.value =
      e instanceof ApiError
        ? e.message
        : formatGuidedError('问题：保存失败。', '原因：网络或服务异常。', '下一步：请重试。')
  } finally {
    savingIntake.value = false
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !requirementId.value || sending.value) return
  sendError.value = ''
  sending.value = true
  inputText.value = ''

  try {
    const res = await intakeApi.appendMessage(requirementId.value, { content: text })
    messages.value = [...messages.value, res.userMessage, res.aiMessage]
    await requirementStore.fetchRequirement(requirementId.value)
  } catch (e) {
    inputText.value = text
    sendError.value =
      e instanceof ApiError
        ? e.message
        : formatGuidedError('问题：消息发送失败。', '原因：未知错误。', '下一步：请重试。')
  } finally {
    sending.value = false
  }
}

function openAbandonConfirm() {
  if (!canAbandon.value) return
  abandonError.value = ''
  abandonReason.value = ''
  abandonConfirmOpen.value = true
}

function closeAbandonConfirm() {
  if (abandoning.value) return
  abandonConfirmOpen.value = false
  abandonError.value = ''
}

async function confirmAbandon() {
  if (!requirementId.value || abandoning.value) return
  abandonError.value = ''
  abandoning.value = true
  try {
    const trimmedReason = abandonReason.value.trim()
    await intakeApi.abandonRequirement(requirementId.value, {
      reason: trimmedReason ? trimmedReason : undefined,
    })
    await requirementStore.fetchRequirement(requirementId.value)
    abandonConfirmOpen.value = false
    abandonReason.value = ''
  } catch (e) {
    abandonError.value =
      e instanceof ApiError
        ? e.message
        : formatGuidedError('问题：放弃操作失败。', '原因：网络或服务异常。', '下一步：请稍后重试。')
  } finally {
    abandoning.value = false
  }
}

async function startFresh() {
  sessionStorage.removeItem(STORAGE_KEY)
  requirementId.value = null
  messages.value = []
  pageLoading.value = true
  pageError.value = ''
  sendError.value = ''
  try {
    await createSessionAndLoad()
  } catch (e) {
    pageError.value =
      e instanceof ApiError
        ? e.message
        : formatGuidedError(
            '问题：无法新建会话。',
            '原因：网络或服务异常。',
            '下一步：请稍后重试。',
          )
  } finally {
    pageLoading.value = false
  }
}

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <div class="mx-auto flex h-full max-w-4xl flex-col">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">发起需求</h1>
        <p class="mt-1 text-sm text-text-muted">通过对话描述业务目标，自动生成标准 PRD 与执行任务</p>
      </div>
      <div v-if="authStore.isBusiness && !pageLoading && !pageError" class="flex flex-wrap items-center gap-2">
        <button
          v-if="canAbandon"
          type="button"
          data-test="abandon-button"
          class="min-h-11 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
          @click="openAbandonConfirm"
        >
          放弃需求
        </button>
        <button
          type="button"
          class="min-h-11 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-slate-50"
          @click="startFresh"
        >
          新建会话
        </button>
      </div>
    </div>

    <p
      v-if="pageError"
      class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="alert"
    >
      {{ pageError }}
    </p>

    <div
      v-if="pageLoading"
      class="flex flex-1 items-center justify-center rounded-xl border border-border bg-white p-12 text-sm text-text-muted shadow-card"
    >
      正在加载对话…
    </div>

    <div v-else-if="!pageError" class="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-card">
      <div class="h-full space-y-4 overflow-y-auto p-6 pb-28">
        <div
          v-if="authStore.isBusiness && isCollecting && enabledUnits.length"
          class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-text-primary"
        >
          <p class="font-medium text-text-primary">启用板块</p>
          <p class="mt-1 text-xs text-text-muted">若自动识别不准确，可手动选择板块后点击「保存并重新评估」。</p>
          <div class="mt-3 flex flex-wrap items-end gap-2">
            <label class="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-text-muted">
              选择板块
              <select
                v-model="selectedBusinessUnitId"
                class="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
              >
                <option value="" disabled>请选择板块</option>
                <option v-for="u in enabledUnits" :key="u.id" :value="u.id">
                  {{ u.name }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-40"
              :disabled="!selectedBusinessUnitId || savingIntake"
              @click="saveIntakeCorrection"
            >
              {{ savingIntake ? '保存中…' : '保存并重新评估' }}
            </button>
          </div>
          <p v-if="intakeError" class="mt-2 text-sm text-danger">{{ intakeError }}</p>
        </div>

        <div
          v-if="isReceived"
          class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          接待已完成（{{ STATUS_LABEL.received }}）。对话已关闭，请从需求列表查看后续流程。
        </div>

        <div
          v-if="isAbandoned"
          data-test="abandoned-banner"
          class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="status"
        >
          <p class="font-medium">该需求已放弃（{{ STATUS_LABEL.abandoned }}）。</p>
          <p class="mt-1">对话已关闭，历史消息与字段快照保持可追溯。如需继续推进，请从「新建会话」重新发起。</p>
        </div>

        <p
          v-if="deepLinkHint"
          data-test="deep-link-hint"
          class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          {{ deepLinkHint }}
        </p>

        <div
          v-if="
            canViewIntakeAdmission &&
            admission &&
            (admission.businessUnitId ||
              admission.admissionScore != null ||
              admission.admissionRationale)
          "
          class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-text-primary"
        >
          <p class="font-medium text-text-primary">识别与准入</p>
          <ul class="mt-2 list-inside list-disc space-y-1 text-text-secondary">
            <li v-if="admission.businessUnitId">
              拟归属板块：{{ unitNameById.get(admission.businessUnitId) ?? admission.businessUnitId }}
            </li>
            <li v-if="admission.projectIds?.length">关联项目 ID：{{ admission.projectIds.join('、') }}</li>
            <li v-if="admission.admissionScore != null">匹配度：{{ admission.admissionScore }}</li>
            <li v-if="admission.admissionRationale">说明：{{ admission.admissionRationale }}</li>
          </ul>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
            :class="
              msg.role === 'user'
                ? 'rounded-br-sm bg-primary-600 text-text-inverse'
                : 'rounded-bl-sm bg-primary-50 text-text-primary'
            "
          >
            <div class="markdown-content" v-html="renderMarkdown(msg.content)" />
          </div>
        </div>
      </div>

      <div
        v-if="abandonConfirmOpen"
        data-test="abandon-modal"
        class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/30 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abandon-modal-title"
      >
        <div class="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-xl">
          <h2 id="abandon-modal-title" class="text-base font-semibold text-text-primary">确认放弃该需求？</h2>
          <p class="mt-2 text-sm text-text-secondary">
            放弃后，本次对话将关闭、无法继续发送消息；历史消息与字段快照会完整保留以便追溯。此操作不可撤销。
          </p>
          <label class="mt-4 flex flex-col gap-1 text-xs text-text-muted">
            放弃原因（可选）
            <textarea
              v-model="abandonReason"
              rows="3"
              data-test="abandon-reason"
              placeholder="如：业务优先级调整、改走其他渠道…"
              class="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-text-primary focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
              :disabled="abandoning"
            />
          </label>
          <p v-if="abandonError" class="mt-2 text-sm text-danger" role="alert">{{ abandonError }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-test="abandon-cancel"
              class="min-h-11 rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-secondary transition hover:bg-slate-50 disabled:opacity-50"
              :disabled="abandoning"
              @click="closeAbandonConfirm"
            >
              取消
            </button>
            <button
              type="button"
              data-test="abandon-confirm"
              class="min-h-11 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
              :disabled="abandoning"
              @click="confirmAbandon"
            >
              {{ abandoning ? '放弃中…' : '确认放弃' }}
            </button>
          </div>
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 border-t border-slate-100 bg-white/95 p-4 backdrop-blur">
        <p
          v-if="sendError"
          class="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ sendError }}
        </p>
        <div class="flex items-end gap-3">
          <textarea
            v-model="inputText"
            rows="2"
            placeholder="直接说出你的想法，或粘贴业务文档..."
            :disabled="sending || !requirementId || !isCollecting || abandoning"
            data-test="chat-input"
            class="min-h-11 flex-1 resize-none rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none disabled:opacity-50"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            type="button"
            class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-text-inverse transition hover:bg-primary-700 disabled:opacity-40"
            :disabled="!canSend"
            aria-label="发送消息"
            @click="sendMessage"
          >
            <PaperAirplaneIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  font-weight: 600;
  margin: 0.25rem 0;
}

.markdown-content :deep(p) {
  margin: 0.15rem 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.2rem 0 0.2rem 1.25rem;
}

.markdown-content :deep(ul) {
  list-style: disc;
}

.markdown-content :deep(ol) {
  list-style: decimal;
}

.markdown-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.85em;
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  background: rgba(148, 163, 184, 0.2);
}

.markdown-content :deep(a) {
  text-decoration: underline;
}
</style>
