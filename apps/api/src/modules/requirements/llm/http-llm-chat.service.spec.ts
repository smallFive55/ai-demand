import { resolveOpenAiChatCompletionsUrl } from './http-llm-chat.service'

describe('resolveOpenAiChatCompletionsUrl', () => {
  it('appends /chat/completions for DashScope-style base URL', () => {
    expect(resolveOpenAiChatCompletionsUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    )
  })

  it('does not duplicate when already complete', () => {
    expect(resolveOpenAiChatCompletionsUrl('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
  })

  it('strips trailing slashes before resolving', () => {
    expect(resolveOpenAiChatCompletionsUrl('https://dashscope.aliyuncs.com/compatible-mode/v1///')).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    )
  })
})
