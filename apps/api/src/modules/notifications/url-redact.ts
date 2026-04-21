/**
 * 通知链路 URL 脱敏工具（Story 2.3 code-review round-3 / MEDIUM-4）。
 *
 * 企业微信 Webhook URL 的 `?key=xxx` 即发送凭证，任何错误消息或日志回显必须脱敏，
 * 避免凭证随审计 `after_data.error` / 日志输出被持久化。
 */

/** 保留 protocol + host + pathname，抹掉 query/hash（含 key=）；解析失败返回 `<redacted>`。 */
export function redactWebhookUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host}${u.pathname}?<redacted>`
  } catch {
    return '<redacted>'
  }
}

/** 把任意字符串中出现的 http(s) 绝对 URL 整段替换为脱敏形式 */
export function sanitizeErrorMessage(raw: string): string {
  return raw.replace(/https?:\/\/\S+/gi, (m) => redactWebhookUrl(m))
}
