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
  <div class="mx-auto flex h-full max-w-2xl flex-col">
    <h1 class="mb-4 text-xl font-bold text-text-primary">提交需求</h1>

    <!-- Chat thread -->
    <div class="flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface-card p-6">
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

    <!-- Input -->
    <div class="mt-4 flex items-end gap-3">
      <textarea
        v-model="inputText"
        rows="2"
        placeholder="描述你的需求..."
        class="flex-1 resize-none rounded-xl border border-border bg-surface-card px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <button
        class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-text-inverse hover:bg-primary-700 transition-colors disabled:opacity-40"
        :disabled="!inputText.trim()"
        @click="sendMessage"
      >
        <PaperAirplaneIcon class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
