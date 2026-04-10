<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PaperAirplaneIcon } from '@heroicons/vue/24/solid'
import { ApiError } from '@/api/client'
import { intakeApi } from '@/features/intake/api'
import { useAuthStore } from '@/stores/auth'
import { useRequirementStore } from '@/stores/requirement'
import type { RequirementMessage } from '@ai-demand/contracts'

const router = useRouter()
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

function formatGuidedError(problem: string, reason: string, nextStep: string) {
  return `${problem} ${reason} ${nextStep}`
}

const canSend = computed(
  () => inputText.value.trim().length > 0 && !sending.value && !!requirementId.value && !pageLoading.value,
)

async function createSessionAndLoad() {
  const created = await intakeApi.createRequirement()
  requirementId.value = created.id
  sessionStorage.setItem(STORAGE_KEY, created.id)
  messages.value = await intakeApi.listMessages(created.id)
  await requirementStore.fetchRequirement(created.id)
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
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        messages.value = await intakeApi.listMessages(stored)
        requirementId.value = stored
        await requirementStore.fetchRequirement(stored)
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
      <button
        v-if="authStore.isBusiness && !pageLoading && !pageError"
        type="button"
        class="min-h-11 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-slate-50"
        @click="startFresh"
      >
        新建会话
      </button>
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
            {{ msg.content }}
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
            :disabled="sending || !requirementId"
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
