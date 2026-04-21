/**
 * 本地开发用 LLM 替身：按轮次填充 CollectedFields；第 3 轮起附带 intakeSuggestion（不含板块 ID），
 * 驱动服务端走「无有效板块」分支，便于联调人工修正与 scoreIntake。
 */
import { Injectable } from '@nestjs/common'
import type { CollectedFields } from '@ai-demand/contracts'
import {
  LlmChatPort,
  type LlmChatResult,
  type LlmChatTurn,
  type ScoreIntakeInput,
  type ScoreIntakeResult,
} from './llm-chat.port'

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

    const intakeSuggestion =
      userTurns >= 3
        ? {
            projectIds: [] as string[],
            admissionRationale: 'Echo：本地模拟未配置板块 ID，请在界面手动选择板块。',
          }
        : undefined

    /** 按轮次区分文案，避免每轮同一句话（真实 LLM 走 HttpLlmChatService，不受此限制） */
    let assistantText: string
    if (userTurns <= 1) {
      assistantText =
        '好的，我已记下你的初步描述。为便于后续生成方案，请继续补充：**涉及的用户或场景**、**核心功能边界**，以及**怎样衡量「做好了」**？可以分条写，也可以一段话里都说清。'
    } else if (userTurns === 2) {
      assistantText =
        '收到，我已把本轮内容记入「功能范围」一侧。请再用一两句话单独写清**验收或成功标准**（例如统计口径、与薪资对账的要求）；若上一段里已经写全，提炼概括即可。'
    } else if (userTurns === 3) {
      assistantText =
        '三件事的占位字段已齐（Echo 替身按轮次写入），下面由服务端结合业务板块做识别与准入评估。'
    } else {
      assistantText =
        '（Echo 本地替身）模板追问已结束。若还有补充，请直接说明要改动的要点。'
    }

    return {
      assistantText,
      collectedFieldsPatch: patch,
      intakeSuggestion,
    }
  }

  async scoreIntake(input: ScoreIntakeInput, _opts: { timeoutMs: number }): Promise<ScoreIntakeResult> {
    const len = input.summary.trim().length
    const score = len > 80 ? 75 : 45
    return {
      score,
      rationale: 'Echo：按摘要长度粗估匹配度（仅本地开发）。',
    }
  }
}
