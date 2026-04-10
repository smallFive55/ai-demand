import { Injectable } from '@nestjs/common'
import type { CollectedFields } from '@ai-demand/contracts'
import { LlmChatPort, type LlmChatResult, type LlmChatTurn } from './llm-chat.port'

@Injectable()
export class EchoLlmChatService extends LlmChatPort {
  async complete(messages: LlmChatTurn[], _opts: { timeoutMs: number }): Promise<LlmChatResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const text = lastUser?.content?.trim() ?? ''
    const userTurns = messages.filter((m) => m.role === 'user').length

    const patch: Partial<CollectedFields> = {}
    if (text) {
      if (userTurns <= 1) {
        patch.goalBackground = text.slice(0, 2000)
      } else if (userTurns === 2) {
        patch.coreScope = text.slice(0, 2000)
      } else {
        patch.successCriteria = text.slice(0, 2000)
      }
    }

    return {
      assistantText:
        '好的，我已记下。为便于后续生成方案，请继续补充：涉及的用户或场景、核心功能边界，以及怎样衡量「做好了」？',
      collectedFieldsPatch: patch,
    }
  }
}
