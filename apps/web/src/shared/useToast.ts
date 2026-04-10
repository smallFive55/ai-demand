import { ref } from 'vue'

let hideTimer: ReturnType<typeof setTimeout> | null = null

/** 轻量底部 Toast，满足管理页成功反馈（无第三方依赖） */
export function useToast() {
  const message = ref('')
  const visible = ref(false)

  function show(text: string, durationMs = 3200) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    message.value = text
    visible.value = true
    hideTimer = setTimeout(() => {
      visible.value = false
      message.value = ''
      hideTimer = null
    }, durationMs)
  }

  return { message, visible, show }
}
