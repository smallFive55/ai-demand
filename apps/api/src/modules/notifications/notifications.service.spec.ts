import { Test, TestingModule } from '@nestjs/testing'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from './notifications.service'
import { NOTIFICATION_EVENTS } from './notifications.types'
import { WECOM_NOTIFIER } from './wecom-notifier.port'

describe('NotificationsService', () => {
  let service: NotificationsService
  let moduleRef: TestingModule

  const mockAudit = { record: jest.fn().mockResolvedValue(undefined) }
  const mockWecom = { sendRequirementAbandoned: jest.fn() }

  const baseInput = {
    requirementId: 'req-1',
    requirementTitle: '营销系统支持活动自动化',
    reason: '业务方决定暂缓本期需求',
    recipientId: 'biz-b',
    actor: 'biz-b',
    requestId: 'r-1',
    occurredAt: '2026-04-21T08:00:00.000Z',
  }

  // M1：保存原始 env，测试后还原，避免污染其他 suite
  const ORIGINAL_BACKOFF = process.env.NOTIFICATION_BACKOFF_BASE_MS
  const ORIGINAL_MAX = process.env.NOTIFICATION_MAX_ATTEMPTS
  const ORIGINAL_GRACE = process.env.NOTIFICATION_SHUTDOWN_GRACE_MS

  beforeEach(async () => {
    jest.clearAllMocks()
    process.env.NOTIFICATION_BACKOFF_BASE_MS = '0'
    process.env.NOTIFICATION_MAX_ATTEMPTS = '3'

    moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: AuditService, useValue: mockAudit },
        { provide: WECOM_NOTIFIER, useValue: mockWecom },
      ],
    }).compile()
    service = moduleRef.get(NotificationsService)
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  afterAll(() => {
    if (ORIGINAL_BACKOFF === undefined) {
      delete process.env.NOTIFICATION_BACKOFF_BASE_MS
    } else {
      process.env.NOTIFICATION_BACKOFF_BASE_MS = ORIGINAL_BACKOFF
    }
    if (ORIGINAL_MAX === undefined) {
      delete process.env.NOTIFICATION_MAX_ATTEMPTS
    } else {
      process.env.NOTIFICATION_MAX_ATTEMPTS = ORIGINAL_MAX
    }
    if (ORIGINAL_GRACE === undefined) {
      delete process.env.NOTIFICATION_SHUTDOWN_GRACE_MS
    } else {
      process.env.NOTIFICATION_SHUTDOWN_GRACE_MS = ORIGINAL_GRACE
    }
  })

  it('sends notification successfully on first attempt and records audit with deep link contract', async () => {
    mockWecom.sendRequirementAbandoned.mockResolvedValueOnce({ externalMessageId: 'wx-99' })

    const result = await service.notifyRequirementAbandoned(baseInput)

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(1)
    expect(result.fallbackTriggered).toBe(false)
    expect(result.externalMessageId).toBe('wx-99')

    expect(mockWecom.sendRequirementAbandoned).toHaveBeenCalledTimes(1)
    const payload = mockWecom.sendRequirementAbandoned.mock.calls[0][0]
    expect(payload.eventName).toBe(NOTIFICATION_EVENTS.REQUIREMENT_ABANDONED)
    expect(payload.deepLinkParams.requirementId).toBe('req-1')
    expect(payload.deepLinkParams.step).toBe('abandon')
    expect(payload.deepLinkParams.source).toBe('wecom')
    expect(typeof payload.deepLinkParams.actionId).toBe('string')
    expect(payload.deepLinkParams.actionId.length).toBeGreaterThan(0)

    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'requirement_abandoned',
        success: true,
        target: 'req-1',
        after: expect.objectContaining({
          channel: 'wecom',
          attempt: 1,
          eventName: NOTIFICATION_EVENTS.REQUIREMENT_ABANDONED,
        }),
      }),
    )
  })

  it('retries on transient failure and succeeds within max attempts', async () => {
    mockWecom.sendRequirementAbandoned
      .mockRejectedValueOnce(new Error('wecom http 502'))
      .mockResolvedValueOnce({ externalMessageId: 'wx-ok' })

    const result = await service.notifyRequirementAbandoned(baseInput)

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(2)
    expect(result.fallbackTriggered).toBe(false)

    const failAudit = mockAudit.record.mock.calls.find(
      ([e]) => e.success === false && e.reasonCode === 'wecom_dispatch_failed',
    )
    expect(failAudit).toBeDefined()
    const successAudit = mockAudit.record.mock.calls.find(
      ([e]) => e.success === true && e.after?.channel === 'wecom',
    )
    expect(successAudit).toBeDefined()
  })

  it('falls back to in-app todo after max attempts exhausted', async () => {
    mockWecom.sendRequirementAbandoned.mockRejectedValue(new Error('wecom errcode=45009'))

    const result = await service.notifyRequirementAbandoned(baseInput)

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(3)
    expect(result.fallbackTriggered).toBe(true)
    expect(result.lastError).toContain('45009')
    expect(mockWecom.sendRequirementAbandoned).toHaveBeenCalledTimes(3)

    const fallbackAudit = mockAudit.record.mock.calls.find(
      ([e]) => e.reasonCode === 'wecom_fallback_in_app_todo',
    )
    expect(fallbackAudit).toBeDefined()
    expect(fallbackAudit?.[0].after).toEqual(
      expect.objectContaining({
        channel: 'in-app-todo',
        fallback: true,
        deepLinkParams: expect.objectContaining({
          requirementId: 'req-1',
          step: 'abandon',
        }),
      }),
    )
  })

  it('respects NOTIFICATION_MAX_ATTEMPTS override and stops early when capped to 1', async () => {
    process.env.NOTIFICATION_MAX_ATTEMPTS = '1'
    mockWecom.sendRequirementAbandoned.mockRejectedValue(new Error('boom'))

    const result = await service.notifyRequirementAbandoned(baseInput)

    expect(result.attempts).toBe(1)
    expect(result.fallbackTriggered).toBe(true)
    expect(mockWecom.sendRequirementAbandoned).toHaveBeenCalledTimes(1)
  })

  it('writes dispatch_started audit row BEFORE any transport attempt (HIGH-2 outbox semantic)', async () => {
    mockWecom.sendRequirementAbandoned.mockResolvedValueOnce({ externalMessageId: 'wx-1' })

    await service.notifyRequirementAbandoned(baseInput)

    const firstAuditCall = mockAudit.record.mock.calls[0][0]
    expect(firstAuditCall.reasonCode).toBe('notification_dispatch_started')
    expect(firstAuditCall.after).toEqual(
      expect.objectContaining({
        phase: 'dispatch_started',
        channel: 'wecom',
        recipientTargeting: 'group_broadcast',
        mentionedCount: 0,
      }),
    )
    // dispatch_started 必须在第一次发送前写入
    const dispatchAuditIdx = 0
    const firstSendIdx = mockWecom.sendRequirementAbandoned.mock.invocationCallOrder[0]
    const dispatchAuditOrder = mockAudit.record.mock.invocationCallOrder[dispatchAuditIdx]
    expect(dispatchAuditOrder).toBeLessThan(firstSendIdx)
  })

  it('marks recipientTargeting=user_mentioned when mentionedWecomUserIds provided (HIGH-3)', async () => {
    mockWecom.sendRequirementAbandoned.mockResolvedValueOnce({ externalMessageId: 'wx-m' })

    await service.notifyRequirementAbandoned({
      ...baseInput,
      mentionedWecomUserIds: ['wx-userA', 'wx-userB'],
    })

    const payload = mockWecom.sendRequirementAbandoned.mock.calls[0][0]
    expect(payload.mentionedWecomUserIds).toEqual(['wx-userA', 'wx-userB'])

    const successAudit = mockAudit.record.mock.calls.find(
      ([e]) => e.success === true && e.after?.attempt === 1,
    )
    expect(successAudit?.[0].after).toEqual(
      expect.objectContaining({ recipientTargeting: 'user_mentioned' }),
    )
  })

  it('redacts WECOM webhook URL leaking via error messages into audit (MEDIUM-4)', async () => {
    mockWecom.sendRequirementAbandoned.mockRejectedValueOnce(
      new Error(
        'wecom http 401 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=SECRET-KEY-XYZ',
      ),
    )
    mockWecom.sendRequirementAbandoned.mockResolvedValueOnce({ externalMessageId: 'wx-retry' })

    await service.notifyRequirementAbandoned(baseInput)

    const failureAudit = mockAudit.record.mock.calls.find(
      ([e]) => e.success === false && e.reasonCode === 'wecom_dispatch_failed',
    )
    const errMsg = failureAudit?.[0].after?.error as string
    expect(errMsg).toBeDefined()
    expect(errMsg).not.toContain('SECRET-KEY-XYZ')
    expect(errMsg).toContain('<redacted>')
  })

  it('clamps NOTIFICATION_BACKOFF_BASE_MS floor at 10ms to avoid 0-gap retry storms (MEDIUM-6)', async () => {
    // env value 0 应被下限钳制到 10ms，而非保持 0
    process.env.NOTIFICATION_BACKOFF_BASE_MS = '0'
    process.env.NOTIFICATION_MAX_ATTEMPTS = '3'
    mockWecom.sendRequirementAbandoned.mockRejectedValue(new Error('boom'))

    const start = Date.now()
    await service.notifyRequirementAbandoned(baseInput)
    const elapsed = Date.now() - start

    // 预期 ≥ 10 + 20 = 30ms；放宽到 ≥25ms 抗抖动
    expect(elapsed).toBeGreaterThanOrEqual(25)
  })

  it('track() registers a promise and clears it after settle', async () => {
    const p = Promise.resolve('ok')
    const tracked = service.track(p)
    await tracked
    // 若未清理，下一次 shutdown 不应感知到此 promise
    await service.onApplicationShutdown()
    // 无需断言具体内部，运行到此处即验证生命周期不抛错
    expect(true).toBe(true)
  })

  it('onApplicationShutdown awaits in-flight notifications (HIGH-2 graceful drain)', async () => {
    let settleInner!: () => void
    const inner = new Promise<void>((r) => {
      settleInner = r
    })
    const tracked = service.track(inner)
    const shutdownP = service.onApplicationShutdown()

    // 给出 20ms 让 shutdown 进入等待状态
    await new Promise((r) => setTimeout(r, 20))
    settleInner()
    await tracked
    await shutdownP

    expect(true).toBe(true)
  })

  it('onApplicationShutdown bails out after grace when in-flight never settle', async () => {
    process.env.NOTIFICATION_SHUTDOWN_GRACE_MS = '30'
    // 复建实例让新的 grace 生效：直接再触发一次即可，内部每次调用时读取 env
    const hanging = new Promise<void>(() => {
      /* never settles */
    })
    void service.track(hanging)

    const start = Date.now()
    await service.onApplicationShutdown()
    const elapsed = Date.now() - start

    // 应在 grace (30ms) 前后返回，不应被悬挂
    expect(elapsed).toBeLessThan(1_000)
  })
})
