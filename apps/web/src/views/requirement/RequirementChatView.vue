<script setup lang="ts">
import { ref } from 'vue'
import { PaperAirplaneIcon } from '@heroicons/vue/24/solid'

const inputText = ref('')
const messages = ref<{ role: 'user' | 'ai'; content: string }[]>([
  { role: 'ai', content: '你好！请描述你的需求，我会帮你整理并完成接待。' },
])

function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  // TODO: AI service integration
}
</script>

<template>
  <div class="mx-auto flex h-full max-w-4xl flex-col">
    <div class="mb-4">
      <h1 class="text-2xl font-bold text-text-primary">发起需求</h1>
      <p class="mt-1 text-sm text-text-muted">通过对话描述业务目标，自动生成标准 PRD 与执行任务</p>
    </div>

    <div class="relative flex-1 overflow-hidden rounded-xl border border-border bg-white shadow-card">
      <div class="h-full space-y-4 overflow-y-auto p-6 pb-24">
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
            :class="
              msg.role === 'user'
                ? 'bg-primary-600 text-text-inverse rounded-br-sm'
                : 'bg-primary-50 text-text-primary rounded-bl-sm'
            "
          >
            {{ msg.content }}
          </div>
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 border-t border-slate-100 bg-white/95 p-4 backdrop-blur">
        <div class="flex items-end gap-3">
          <textarea
            v-model="inputText"
            rows="2"
            placeholder="直接说出你的想法，或粘贴业务文档..."
            class="flex-1 resize-none rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-text-inverse transition hover:bg-primary-700 disabled:opacity-40"
            :disabled="!inputText.trim()"
            @click="sendMessage"
          >
            <PaperAirplaneIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
