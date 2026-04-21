import { Injectable, Logger } from '@nestjs/common'
import type { CollectedFields } from '@ai-demand/contracts'
import {
  LlmChatPort,
  type IntakeSuggestion,
  type LlmChatResult,
  type LlmChatTurn,
  type ScoreIntakeInput,
  type ScoreIntakeResult,
} from './llm-chat.port'

interface OpenAiStyleResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
}

/**
 * 本服务按 OpenAI Chat Completions 约定对 URL 发 POST。
 * 若环境变量只配了 base（如 DashScope `.../compatible-mode/v1`），自动补上 `/chat/completions`，避免 404。
 */
export function resolveOpenAiChatCompletionsUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, '')
  if (!base) return raw.trim()
  const lower = base.toLowerCase()
  if (lower.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

@Injectable()
export class HttpLlmChatService extends LlmChatPort {
  private readonly logger = new Logger(HttpLlmChatService.name)

  async complete(messages: LlmChatTurn[], opts: { timeoutMs: number }): Promise<LlmChatResult> {
    const rawUrl = process.env.LLM_API_URL?.trim()
    if (!rawUrl) {
      throw new Error('LLM_API_URL 未配置')
    }
    const url = resolveOpenAiChatCompletionsUrl(rawUrl)

    const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini'
    const apiKey = process.env.LLM_API_KEY?.trim() ?? ''

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `你是需求分析师。请基于对话用中文回复用户，并严格在回复最后追加一段 JSON（单独一行），格式为：
{"reply":"对用户可见的完整回复文本","collectedFields":{"goalBackground":"…","coreScope":"…","successCriteria":"…"},"intake":{"suggestedBusinessUnitId":"启用板块UUID或省略","projectIds":[],"admissionScore":0,"admissionRationale":"…"}}
说明：
- collectedFields 仅填写已从对话中可靠推断的字段，未知则省略键或填空字符串。
- 当 goalBackground、coreScope、successCriteria 均已能从对话可靠推断时，必须填写 intake：给出 suggestedBusinessUnitId（须为真实存在的业务板块）、0-100 的 admissionScore、简短 admissionRationale；projectIds 为涉及的项目 ID 数组，无则 []。
- 若关键字段仍不齐，可省略 intake 或填空对象。`,
            },
            ...messages,
          ],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        this.logger.warn(`LLM HTTP ${res.status}: ${errText.slice(0, 500)}`)
        throw new Error(`LLM 服务返回 ${res.status}`)
      }

      const body = (await res.json()) as OpenAiStyleResponse
      const raw = body.choices?.[0]?.message?.content ?? ''
      return parseAssistantPayload(raw)
    } finally {
      clearTimeout(timer)
    }
  }

  async scoreIntake(
    input: ScoreIntakeInput,
    opts: { timeoutMs: number },
  ): Promise<ScoreIntakeResult> {
    const rawUrl = process.env.LLM_API_URL?.trim()
    if (!rawUrl) {
      throw new Error('LLM_API_URL 未配置')
    }
    const url = resolveOpenAiChatCompletionsUrl(rawUrl)
    const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini'
    const apiKey = process.env.LLM_API_KEY?.trim() ?? ''

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                '你是准入评估助手。仅根据「需求摘要」与「板块准入标准」判断匹配度。严格在回复最后单独一行输出 JSON：{"score":0到100的整数,"rationale":"一句中文理由"}。不要输出其它文字。',
            },
            {
              role: 'user',
              content: `板块名称：${input.unitName}\n准入标准：${input.admissionCriteria}\n\n需求摘要：\n${input.summary}`,
            },
          ],
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        this.logger.warn(`LLM score HTTP ${res.status}: ${errText.slice(0, 500)}`)
        throw new Error(`LLM 服务返回 ${res.status}`)
      }
      const body = (await res.json()) as OpenAiStyleResponse
      const raw = body.choices?.[0]?.message?.content ?? ''
      const line = extractTrailingJsonLine(raw.trim()) ?? raw.trim()
      const parsed = JSON.parse(line) as { score?: unknown; rationale?: unknown }
      const score = typeof parsed.score === 'number' ? Math.round(parsed.score) : NaN
      const rationale =
        typeof parsed.rationale === 'string' && parsed.rationale.trim()
          ? parsed.rationale.trim()
          : '模型未给出理由'
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        throw new Error('准入打分 JSON 无效')
      }
      return { score, rationale }
    } finally {
      clearTimeout(timer)
    }
  }
}

function parseAssistantPayload(raw: string): LlmChatResult {
  const trimmed = raw.trim()
  const jsonLine = extractTrailingJsonLine(trimmed)
  if (jsonLine) {
    try {
      const parsed = JSON.parse(jsonLine) as {
        reply?: string
        collectedFields?: Partial<CollectedFields>
        intake?: Record<string, unknown>
      }
      const assistantText = (parsed.reply ?? trimmed.replace(jsonLine, '').trim()).trim() || trimmed
      return {
        assistantText,
        collectedFieldsPatch: normalizePatch(parsed.collectedFields),
        intakeSuggestion: normalizeIntake(parsed.intake),
      }
    } catch {
      // fall through
    }
  }
  return { assistantText: trimmed, collectedFieldsPatch: {} }
}

function extractTrailingJsonLine(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim())
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line) continue
    if (line.startsWith('{') && line.endsWith('}')) {
      return line
    }
  }
  const match = text.match(/\{[\s\S]*"reply"[\s\S]*\}/)
  return match ? match[0] : null
}

function normalizePatch(
  fields: Partial<CollectedFields> | undefined,
): Partial<CollectedFields> {
  if (!fields || typeof fields !== 'object') return {}
  const out: Partial<CollectedFields> = {}
  for (const key of ['goalBackground', 'coreScope', 'successCriteria', 'suggestedBusinessUnitId'] as const) {
    const v = fields[key]
    if (typeof v === 'string' && v.trim()) {
      out[key] = v.trim()
    }
  }
  return out
}

function normalizeIntake(raw: Record<string, unknown> | undefined): IntakeSuggestion | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: IntakeSuggestion = {}
  if (typeof raw.suggestedBusinessUnitId === 'string' && raw.suggestedBusinessUnitId.trim()) {
    out.suggestedBusinessUnitId = raw.suggestedBusinessUnitId.trim()
  }
  if (Array.isArray(raw.projectIds)) {
    out.projectIds = raw.projectIds.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  }
  if (typeof raw.admissionScore === 'number' && Number.isFinite(raw.admissionScore)) {
    out.admissionScore = Math.round(raw.admissionScore)
  }
  if (typeof raw.admissionRationale === 'string' && raw.admissionRationale.trim()) {
    out.admissionRationale = raw.admissionRationale.trim()
  }
  if (
    !out.suggestedBusinessUnitId &&
    !out.projectIds?.length &&
    out.admissionScore === undefined &&
    !out.admissionRationale
  ) {
    return undefined
  }
  return out
}
