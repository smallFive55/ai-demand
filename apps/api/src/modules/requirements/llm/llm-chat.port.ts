import type { CollectedFields } from '@ai-demand/contracts'

export type LlmDialogRole = 'user' | 'assistant' | 'system'

export interface LlmChatTurn {
  role: LlmDialogRole
  content: string
}

/** LLM 在关键字段齐备时可选返回的识别/打分建议（须经服务端校验） */
export interface IntakeSuggestion {
  suggestedBusinessUnitId?: string
  projectIds?: string[]
  admissionScore?: number
  admissionRationale?: string
}

export interface LlmChatResult {
  assistantText: string
  collectedFieldsPatch: Partial<CollectedFields>
  intakeSuggestion?: IntakeSuggestion
}

export interface ScoreIntakeInput {
  summary: string
  unitName: string
  admissionCriteria: string
}

export interface ScoreIntakeResult {
  score: number
  rationale: string
}

export abstract class LlmChatPort {
  abstract complete(
    messages: LlmChatTurn[],
    opts: { timeoutMs: number },
  ): Promise<LlmChatResult>

  /**
   * 将需求摘要与板块准入标准对照打分（对话识别与 PATCH 人工修正复用）。
   * 非 LLM 路径的耗时预期：见 RequirementsService 注释（NFR3）。
   */
  abstract scoreIntake(
    input: ScoreIntakeInput,
    opts: { timeoutMs: number },
  ): Promise<ScoreIntakeResult>
}

/** Nest 注入令牌（抽象类不宜直接作 token） */
export const LLM_CHAT = 'LlmChatPort'
