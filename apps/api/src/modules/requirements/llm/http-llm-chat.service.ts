import { Injectable, Logger } from '@nestjs/common'
import type { CollectedFields } from '@ai-demand/contracts'
import { LlmChatPort, type LlmChatResult, type LlmChatTurn } from './llm-chat.port'

interface OpenAiStyleResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
}

@Injectable()
export class HttpLlmChatService extends LlmChatPort {
  private readonly logger = new Logger(HttpLlmChatService.name)

  async complete(messages: LlmChatTurn[], opts: { timeoutMs: number }): Promise<LlmChatResult> {
    const url = process.env.LLM_API_URL?.trim()
    if (!url) {
      throw new Error('LLM_API_URL 未配置')
    }

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
{"reply":"对用户可见的完整回复文本","collectedFields":{"goalBackground":"…","coreScope":"…","successCriteria":"…"}}
其中 collectedFields 仅填写已从对话中可靠推断的字段，未知则省略键或填空字符串。`,
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
}

function parseAssistantPayload(raw: string): LlmChatResult {
  const trimmed = raw.trim()
  const jsonLine = extractTrailingJsonLine(trimmed)
  if (jsonLine) {
    try {
      const parsed = JSON.parse(jsonLine) as {
        reply?: string
        collectedFields?: Partial<CollectedFields>
      }
      const assistantText = (parsed.reply ?? trimmed.replace(jsonLine, '').trim()).trim() || trimmed
      return {
        assistantText,
        collectedFieldsPatch: normalizePatch(parsed.collectedFields),
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
