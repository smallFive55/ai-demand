import { HttpWecomNotifierService } from './http-wecom-notifier.service'
import {
  NOTIFICATION_EVENTS,
  type WecomRequirementAbandonedPayload,
} from './notifications.types'

describe('HttpWecomNotifierService (Story 2.3 code-review round-3)', () => {
  let service: HttpWecomNotifierService
  const validWebhook =
    'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=SECRET-KEY-XYZ'

  const ORIGINAL_ENV = { ...process.env }
  const RealFetch = global.fetch

  const mockFetchOk: jest.MockedFunction<typeof fetch> = jest.fn()

  function parseLastFetchBody(): { text: { content: string; mentioned_list?: string[] } } {
    const lastCall = mockFetchOk.mock.calls[mockFetchOk.mock.calls.length - 1]
    const init = lastCall[1] as RequestInit | undefined
    const body = typeof init?.body === 'string' ? init.body : '{}'
    return JSON.parse(body) as { text: { content: string; mentioned_list?: string[] } }
  }

  beforeEach(() => {
    service = new HttpWecomNotifierService()
    process.env.WECOM_WEBHOOK_URL = validWebhook
    process.env.APP_PUBLIC_URL = 'https://app.example.com'
    delete process.env.APP_WEB_BASE_URL
    delete process.env.NOTIFICATION_ABANDON_DEEP_LINK_PATH
    mockFetchOk.mockReset()
    mockFetchOk.mockResolvedValue(
      new Response(JSON.stringify({ errcode: 0, msgid: 'wx-1' }), { status: 200 }),
    )
    global.fetch = mockFetchOk as unknown as typeof fetch
  })

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV }
    global.fetch = RealFetch
  })

  const samplePayload = (
    over: Partial<WecomRequirementAbandonedPayload> = {},
  ): WecomRequirementAbandonedPayload => ({
    eventName: NOTIFICATION_EVENTS.REQUIREMENT_ABANDONED,
    recipientId: 'biz-b',
    requirementId: 'req-1',
    requirementTitle: '活动自动化',
    reason: '优先级调整',
    occurredAt: '2026-04-21T08:00:00.000Z',
    deepLinkParams: {
      requirementId: 'req-1',
      step: 'abandon',
      actionId: 'act-123',
      source: 'wecom',
    },
    ...over,
  })

  it('HIGH-1: builds deep link on /business/approvals by default (architecture.md:104 contract)', async () => {
    await service.sendRequirementAbandoned(samplePayload())
    const body = parseLastFetchBody()
    expect(body.text.content).toContain(
      'https://app.example.com/business/approvals?requirementId=req-1',
    )
    expect(body.text.content).toContain('step=abandon')
    expect(body.text.content).toContain('actionId=act-123')
    expect(body.text.content).toContain('source=wecom')
  })

  it('HIGH-1: NOTIFICATION_ABANDON_DEEP_LINK_PATH overrides default path', async () => {
    process.env.NOTIFICATION_ABANDON_DEEP_LINK_PATH = '/legacy/requirement/new'
    await service.sendRequirementAbandoned(samplePayload())
    const body = parseLastFetchBody()
    expect(body.text.content).toContain(
      'https://app.example.com/legacy/requirement/new?requirementId=req-1',
    )
  })

  it('HIGH-1: env without leading slash is normalized', async () => {
    process.env.NOTIFICATION_ABANDON_DEEP_LINK_PATH = 'custom/path'
    await service.sendRequirementAbandoned(samplePayload())
    const body = parseLastFetchBody()
    expect(body.text.content).toContain('https://app.example.com/custom/path?')
  })

  it('MEDIUM-2: prefers APP_PUBLIC_URL over APP_WEB_BASE_URL', async () => {
    process.env.APP_PUBLIC_URL = 'https://public.example.com'
    process.env.APP_WEB_BASE_URL = 'https://legacy.example.com'
    await service.sendRequirementAbandoned(samplePayload())
    const body = parseLastFetchBody()
    expect(body.text.content).toContain('https://public.example.com/business/approvals')
    expect(body.text.content).not.toContain('legacy.example.com')
  })

  it('MEDIUM-2: falls back to APP_WEB_BASE_URL when APP_PUBLIC_URL is absent', async () => {
    delete process.env.APP_PUBLIC_URL
    process.env.APP_WEB_BASE_URL = 'https://legacy.example.com'
    await service.sendRequirementAbandoned(samplePayload())
    const body = parseLastFetchBody()
    expect(body.text.content).toContain('https://legacy.example.com/business/approvals')
  })

  it('MEDIUM-2: throws when both APP_PUBLIC_URL and APP_WEB_BASE_URL are missing', async () => {
    delete process.env.APP_PUBLIC_URL
    delete process.env.APP_WEB_BASE_URL
    await expect(service.sendRequirementAbandoned(samplePayload())).rejects.toThrow(
      /APP_PUBLIC_URL 未配置/,
    )
  })

  it('MEDIUM-4: non-HTTPS WECOM_WEBHOOK_URL throws redacted error (no ?key= leak)', async () => {
    process.env.WECOM_WEBHOOK_URL = 'http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=SECRET'
    let caught: Error | undefined
    try {
      await service.sendRequirementAbandoned(samplePayload())
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeDefined()
    expect(caught!.message).toContain('必须使用 https 协议')
    expect(caught!.message).not.toContain('SECRET')
    expect(caught!.message).toContain('<redacted>')
  })

  it('MEDIUM-4: malformed WECOM_WEBHOOK_URL throws redacted error', async () => {
    process.env.WECOM_WEBHOOK_URL = 'not-a-url?key=SECRET'
    let caught: Error | undefined
    try {
      await service.sendRequirementAbandoned(samplePayload())
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeDefined()
    expect(caught!.message).toContain('无法解析')
    expect(caught!.message).not.toContain('SECRET')
  })

  it('HIGH-3: injects mentioned_list in text body when mentionedWecomUserIds provided', async () => {
    await service.sendRequirementAbandoned(
      samplePayload({ mentionedWecomUserIds: ['wx-user-A', 'wx-user-B'] }),
    )
    const body = parseLastFetchBody()
    expect(body.text.mentioned_list).toEqual(['wx-user-A', 'wx-user-B'])
    expect(body.text.content).toContain('通知对象：@wx-user-A @wx-user-B')
  })

  it('HIGH-3: omits mentioned_list entirely when list is empty', async () => {
    await service.sendRequirementAbandoned(
      samplePayload({ mentionedWecomUserIds: [] }),
    )
    const body = parseLastFetchBody()
    expect(body.text.mentioned_list).toBeUndefined()
    expect(body.text.content).not.toContain('通知对象：')
  })

  it('surfaces non-2xx as Error for upstream retry', async () => {
    mockFetchOk.mockResolvedValueOnce(
      new Response('nope', { status: 502, statusText: 'Bad Gateway' }),
    )
    await expect(service.sendRequirementAbandoned(samplePayload())).rejects.toThrow(/502/)
  })

  it('surfaces errcode!=0 as Error', async () => {
    mockFetchOk.mockResolvedValueOnce(
      new Response(JSON.stringify({ errcode: 45009, errmsg: 'frequency limit' }), {
        status: 200,
      }),
    )
    await expect(service.sendRequirementAbandoned(samplePayload())).rejects.toThrow(/45009/)
  })
})
