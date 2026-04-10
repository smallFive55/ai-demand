import type { CollectedFields } from '@ai-demand/contracts'

export type LlmDialogRole = 'user' | 'assistant' | 'system'

export interface LlmChatTurn {
  role: LlmDialogRole
  content: string
}

export interface LlmChatResult {
  assistantText: string
  collectedFieldsPatch: Partial<CollectedFields>
}

export abstract class LlmChatPort {
  abstract complete(
    messages: LlmChatTurn[],
    opts: { timeoutMs: number },
  ): Promise<LlmChatResult>
}

/** Nest 注入令牌（抽象类不宜直接作 token） */
export const LLM_CHAT = 'LlmChatPort'
